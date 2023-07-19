'use strict';

// const subdomain = 'SUBDOMAIN';
const subdomain = 'mbphonetoapp';
const { Vonage } = require('@vonage/server-sdk');
const { tokenGenerate } = require('@vonage/jwt');
require('dotenv').config();
const axios = require('axios');
const fs = require("fs");

const express = require('express')
const app = express();
var url = '';
app.use(express.json());
// CORS stuff.. the usual
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
    next();
});

// We will set up our DataCenter (DC) to be US, since our Numbers are US numbers.  
const dc = "-us-1";
var gUser = "";
const options = {
    apiHost: `https://api${dc}.nexmo.com`,
};

// THe following data structures are implemented in plain JSON, but in a "real life" scenario, could be in a DB, or Redis, or.. your datastore of choice.
// These are hardcoded here for the sake of simplicity, but obviously in real implementations should be dynamic
// For this example, we have two queues of registered users... agents, and assistants.  Basically, web agents "register" that they are available for calls, and they can register for one or more of the queues...
var agents = [];
var assistants = [];

// This is a structure that holds the queues.
var queues = {
    agents: agents,
    assistants: assistants,
};
// Just to keep track of the customers calling in (and keeping some state)
var customers = [];

// These are the departments that the caller can be transfered to.  THey can be Phone or App mumbers, and can be marked as active:true or active:false.  
//  If active:false, the user will be sent to voicemail.
var departments = {
    gp: { id: 'gp', type: 'phone', number: '14083753079', active: true },
    surgeon: { id: 'surgeon', type: 'phone', number: '14083753079', active: false },
    billing: { id: 'billing', type: 'phone', number: '14083753079', active: true },
    appt: { id: 'appt', type: 'app', number: 'John', active: true },
};

// The heart and soul of this whole thing... a description of the desired IVR.  Each prompt has a unique id (index). Basically, you have a "starting point" (parent=0). While at that node, the user gets prompted with whatever nodes
// have it as a "parent".  eg:
//                                      ---- Node 6 (Parent=2) ...
//            ---- Node 2 (Parent=1) ---|
//  Node1  ---|                         ---- Node 7 (Parent=2) ...
//            ---- Node 3 (Parent=1) ...
//
//
// Each node has a "prompt" (what the IVR will say), a "press" (the DTMF number they should press, and an (optional) "action".  ## in the prompt is substituted with "press", and "#NAME" is substituted with the selected (registered) agent's name
// "action" can consist of null (just a straight prompt), "transfer" which will transfer the call to the appropriate department, or "iterate", where the following prompt will iterate through the currently registered users in the appropriate queue

var ivr = {
    1: { id: 1, parent: 0, press: -1, prompt: "Welcome to our IVR", action: null },
    2: { id: 2, parent: 1, press: 1, prompt: "Press ## for a Doctor", action: null },
    3: { id: 3, parent: 1, press: 2, prompt: "Press ## for a Medical Assistant", action: null },
    4: { id: 4, parent: 1, press: 3, prompt: "Press ## for Billing", action: { transfer: "billing", who: "Billing representative" } },
    5: { id: 5, parent: 1, press: 4, prompt: "Press ## for Appointments", action: null },
    6: { id: 6, parent: 2, press: 1, prompt: "Press ## for a General Practitioner", action: { transfer: "gp", who: "general practitioner" } },
    7: { id: 7, parent: 2, press: 2, prompt: "Press ## for a Surgeon", action: { transfer: "surgeon", who: "surgeon" } },
    8: { id: 8, parent: 3, press: 0, prompt: "Press ## for #NAME", action: { iterate: "agents" } },
    9: { id: 9, parent: 5, press: 1, prompt: "Press ## to make an appointment", action: { transfer: "appt", who: "appointment assistant", why: "create" } },
    10: { id: 10, parent: 5, press: 2, prompt: "Press ## to change an appointment", action: { transfer: "appt", who: "appointment assistant", why: "change" } },
    11: { id: 11, parent: 5, press: 3, prompt: "Press ## to delete an appointment", action: { transfer: "appt", who: "appointment assistant", why: "delete" } },
}

//Instantiate the main Vonage object, and use the appropriate DC 
const vonage = new Vonage({
    apiKey: process.env.apiKey,
    apiSecret: process.env.apiSecret,
    applicationId: process.env.applicationId,
    privateKey: process.env.privateKey
}, options)
// There is an idiosyncracy with the tokenGEnerate code, where it is expecting the CONTENTS of the keyfile.. So, just read it in from the file.
var keyfile = '' + fs.readFileSync(process.env.privateKey);
// Create a "Global JWT", one that does not expire and will be used within the Server app for doing Vonage stuff
let gjwt = tokenGenerate(process.env.applicationId, keyfile, {});

function doIterate(node, from) {
    let action = node.action;
    let queue = queues[node.action.iterate];
    console.log("Got potential queue: ",queue);
    let ncco = [];
    if (!queue || !Object.keys(queue).length) {
        ncco.push({
            action: "talk",
            text: "Nobody is currently available to take your call. Please leave a message.",
            language: "en-US",
            style: 2,
            premium: true,
        },
            {
                action: "record",
                endOnSilence: 5,
                beepStart: true,
                timeOut: 10,
                eventUrl: [url + "/voice/recordings"],
                transcription:
                {
                    eventMethod: "POST",
                    eventUrl: [url + "/voice/transcript"],
                    language: "en-US"
                }
            }
        )
    } else {
        let index = 1;
        customers[from].choices = [];
        for (var key in queue) {
            var agent = agents[key];
            console.log("Got agent " + agent.name)
            customers[from].choices[index] = key;
            //names.push(agent.name);
            ncco.push({
                action: "talk",
                text: "Press " + index + " for " + agent.name,
                bargeIn: true,
                language: "en-US",
                style: 2,
                premium: true,
            }
            )
            index++;
        }
        ncco.push({
            action: "talk",
            text: "Press " + index + " to leave a message recording.",
            bargeIn: true,
            language: "en-US",
            style: 2,
            premium: true,
        }
        )
        ncco.push(
            {
                action: "input",
                eventUrl: [
                    url + "/voice/ivr?from=" + from + "&action=" + action.id + "&node=" + node.id
                ],
                type: ["dtmf", "speech"],
                dtmf: {
                    maxDigits: 1
                },
                speech: {
                    //context: names,
                    endOnSilence: 2,
                }
            }
        )
    }
    return ncco;
}
async function getUser(name) {
    // Ok, we are passed in a "user" name.  First, we will check if it already exists...
    return new Promise(async (resolve, reject) => {

        var results;
        try {
            results = await axios.get('https://api.nexmo.com/v0.3/users?name=' + name,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + gjwt
                    }
                });
            console.log("User Retrieval results: ", results.data._embedded.users[0].id);
            // If thisuser already exists, just use it!
            resolve(results.data._embedded.users[0].id);
            return;
        } catch (err) {
            console.log("User retrieval error: ", err.response.data)
        }
        // If we are here, that means the user does NOT exist, so let's create it!
        try {
            let body = {
                name: name,
                display_name: name
            }
            results = await axios.post('https://api.nexmo.com/v0.3/users', body,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + gjwt
                    }
                });
            console.log("User creation results: ", results.data);
            // We created the new user, so pass back the id (so we can pass it along)
            resolve(results.data.id);
            return;
        } catch (err) {
            console.log("User creation error: ", err.response?.statusText)
            resolve(null);
        }
    })
}
app.post('/unregister', async (req, res) => {
    // When an Agent comes online, they will issue a "register" post, passing in the username in the POST body
    let user = req.body.user;
    console.log("Deleting user: " + user);
    delete agents[user];
    console.log("# of Agents: " + Object.keys(agents).length)
    return res.status(200).end();
})

app.post('/register', async (req, res) => {
    // When an Agent comes online, they will issue a "register" post, passing in the username in the POST body
    let user = req.body.user;
    let dept = req.body.dept ? req.body.dept : 'general';
    console.log("Creating user: " + user);
    // We will either get or create this user (depending on if it already exists or not)
    let userId = await getUser(user);
    //console.log("Generating JWT for user: " + user)
    // Then, we will generate a CLIENT side JWT for that user
    let jwt = await generateJWT(user);
    gUser = user;
    agents[user] = {
        name: user,
        id: userId,
        dept: dept,
        active: 1,
        registered: Math.round(Date.now() / 1000),
    }
    console.log("# of Agents: " + Object.keys(agents).length)
    console.log("Queues: ",queues);
    // We then return from the registration, passing back the userId, username (same as was passed in), the client jwt (token), AND the DC that we used, so that we are SURE the client uses the same DC
    return res.status(200).json({ name: user, userId: userId, token: jwt, dc: dc, phone: process.env.number });
})
function setupWebhooks(url) {
    // We set up the webhooks for our ApplicationID, for the Voice (answer and events).  One time at startup.
    vonage.applications.updateApplication({
        id: process.env.applicationId,
        name: "INAPPSERVER",
        capabilities: {
            voice: {
                webhooks: {
                    answer_url: {
                        address: url + "/voice/answer",
                        http_method: "GET"
                    },
                    event_url: {
                        address: url + "/voice/event",
                        http_method: "POST"
                    }
                },
            },
        }
    }).then(result => {
        console.log(result.capabilities.voice);
    }).catch(error => {
        console.error(error);
    })
}
async function generateJWT(sub) {
    // Generate a JWT with the appropriate ACL
    let jwtExpiration = Math.round(new Date().getTime() / 1000) + 2592000
    const aclPaths = {
        "paths": {
            "/*/users/**": {},
            "/*/conversations/**": {},
            "/*/sessions/**": {},
            "/*/devices/**": {},
            "/*/image/**": {},
            "/*/media/**": {},
            "/*/applications/**": {},
            "/*/push/**": {},
            "/*/knocking/**": {},
            "/*/legs/**": {}
        }
    }
    let claims = {
        exp: jwtExpiration,
        acl: aclPaths,
    }
    // ONLY Client JWTs use a "sub", so don't add one if it isnlt passed in
    if (sub != null) {
        claims.sub = sub
    }
    //console.log(process.env.applicationId, process.env.privateKey, claims);
    const jwt = tokenGenerate(process.env.applicationId, keyfile, claims)
    //console.log("Jwt: ", jwt)
    return (jwt);
}
function getNodes(id) {
    let nodes = [];
    for (var key in ivr) {
        let node = ivr[key];
        if (node.parent == id) {
            nodes.push(node);
        }
    }
    return nodes;
}
app.get('/', (req, res) => {
    console.log("Got to root.  Just to prove the tunnel works");
    res.send
    Status(200);
})
app.get('/voice/answer', (req, res) => {
    console.log(`Answer: `, req.query);
    let curnode = -1;
    customers[req.query.from] = {
        starttime: Math.round(new Date().getTime() / 1000),
        from: req.query.from,
        to: req.query.to,
        uuid: req.query.uuid,
        curnode: curnode,
        history: curnode,
    };
    let ncco = [];
    let start = getNodes(0);
    console.log("Start node: ", start);
    customers[req.query.from].curnode = start.id;
    ncco.push({
        action: "talk",
        text: start[0].prompt,
        language: "en-US",
        style: 2,
        premium: true,
    }
    );
    let nodes = getNodes(start[0].id);
    console.log(nodes);
    nodes.forEach((node) => {
        let prompt = node.prompt.replace('##', node.press);
        ncco.push({
            action: "talk",
            text: prompt,
            bargeIn: true,
            language: "en-US",
            style: 2,
            premium: true,
        })
    })
    ncco.push(
        {
            action: "input",
            eventUrl: [
                url + "/voice/ivr?from=" + req.query.from + "&node=" + start[0].id
            ],
            type: ["dtmf", "speech"],
            dtmf: {
                maxDigits: 1
            },
            speech: {
                //context: names,
                endOnSilence: 2,
            }
        }
    )
    console.log("Returning NCCO: ", ncco)
    return res.status(200).json(ncco);
})

app.all('/voice/event', (req, res) => {
    console.log('EVENT: ', req.body?.status);
    res.sendStatus(200);
});
app.all('/voice/recordings', (req, res) => {
    console.log('Recording Event:');
    console.dir(req.body);
    console.log('---');
    if (req.body.recording_url) {
        let fname = req.body.recording_uuid + '.mp3';
        axios.get(req.body.recording_url,
            {
                responseType: 'arraybuffer',
                headers: {
                    'Authorization': 'Bearer ' + gjwt
                }
            }).then((result) => {
                fs.writeFileSync(fname, result.data);
                console.log("Saved file: ", fname);
            })
    }
    res.sendStatus(200);
});
app.all('/voice/ivr', (req, res) => {
    console.log('IVR Event: ', req.body);
    console.log('IVR Query Parameters: ', req.query);
    //console.log("Speech results: ", req.body.speech?.results)
    let ncco = [];
    let agent = null;
    if (!req.query.from || !req.query.node || (req.query.from != req.body.from)) {
        // Invalid/unexpected response
        console.log("IVR Unexpected response, exiting");
        return res.status(200).json(ncco);
    }
    let from = req.body.from;
    if (req.query.action) { // Selected to call from iterate command
        console.log("Need to connect to specified agent");
        if (customers[from] && customers[from].choices.length) {
            let name = agents[customers[from].choices[req.body.dtmf.digits]].name
            ncco.push({
                action: "talk",
                text: "Now connecting you to " + name,
                language: "en-US",
                style: 2,
                premium: true,
            }
            );
            ncco.push({
                action: "connect",
                from: req.query.from,
                endpoint: [
                    { type: "app", user: name }
                ]
            })
            console.log("IVR connecting to agent NCCO: ", ncco);
            return res.status(200).json(ncco);
        }
    }
    let nodes = getNodes(req.query.node)
    //console.log("Potential response nodes: ", nodes)
    let resnode = nodes.find(node => {
        if (node.press == req.body.dtmf.digits) { // Bingo!
            return node;
        }
    })
    if (!resnode) {// Invalid IVR response
        ncco.push({
            action: "talk",
            text: "Invalid response, try again.",
            language: "en-US",
            style: 2,
            premium: true,
        },
            {
                action: "input",
                eventUrl: [
                    url + "/voice/ivr?from=" + req.query.from + "&node=" + req.query.node
                ],
                type: ["dtmf", "speech"],
                dtmf: {
                    maxDigits: 1
                },
                speech: {
                    //context: names,
                    endOnSilence: 2,
                }
            }
        );
        return res.status(200).json(ncco);
    }
    if (resnode.action) {  // This node takes special action
        if (resnode.action.transfer) {
            let dept = departments[resnode.action.transfer];
            if (!dept || !dept.active) {
                ncco.push({
                    action: "talk",
                    text: "Please leave a message for the " + resnode.action.who + " at the beep.",
                    language: "en-US",
                    style: 2,
                    premium: true,
                },
                    {
                        action: "record",
                        endOnSilence: 5,
                        beepStart: true,
                        timeOut: 10,
                        eventUrl: [url + "/voice/recordings"],
                        transcription:
                        {
                            eventMethod: "POST",
                            eventUrl: [url + "/voice/transcript"],
                            language: "en-US"
                        }
                    }
                )
            } else {
                var endpoint;
                if (dept.type == "phone") {
                    endpoint = { type: "phone", number: dept.number }
                } else {
                    endpoint = { type: "app", user: dept.number }
                }
                ncco.push({
                    action: "talk",
                    text: "Now connecting you to " + resnode.action.who,
                    language: "en-US",
                    style: 2,
                    premium: true,
                }
                );
                ncco.push({
                    action: "connect",
                    from: req.query.from,
                    endpoint: [
                        endpoint
                    ]
                })
            }
        }
        return res.status(200).json(ncco);
    }
    nodes = getNodes(resnode.id);
    console.log("New selection nodes: ", nodes);
    if ((nodes.length == 1) && (nodes[0].action.iterate)) {
        ncco = doIterate(nodes[0], req.query.from);
        console.log("IVR Iteration NCCO: ", ncco);
        return res.status(200).json(ncco);
    }
    nodes.forEach((node) => {
        let prompt = node.prompt.replace('##', node.press);
        ncco.push({
            action: "talk",
            text: prompt,
            bargeIn: true,
            language: "en-US",
            style: 2,
            premium: true,
        })
    })
    ncco.push(
        {
            action: "input",
            eventUrl: [
                url + "/voice/ivr?from=" + req.query.from + "&node=" + resnode.id
            ],
            type: ["dtmf", "speech"],
            dtmf: {
                maxDigits: 1
            },
            speech: {
                //context: names,
                endOnSilence: 2,
            }
        }
    )
    console.log("IVR NCCO: ", ncco);
    return res.status(200).json(ncco);
});

if (subdomain == "SUBDOMAIN") {
    console.log('\n\t🚨🚨🚨 Please change the SUBDOMAIN value');
    return false;
}
app.listen(3000);

const localtunnel = require('localtunnel');
(async () => {
    const tunnel = await localtunnel({
        subdomain: subdomain,
        port: 3000
    });
    console.log(`App available at: ${tunnel.url}`);
    // Now that we now the external tunnel name, set up our Voice Webhooks to point here.
    url = tunnel.url;
    setupWebhooks(url)
})();
