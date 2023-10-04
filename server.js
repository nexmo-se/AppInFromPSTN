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

var agents = [];
var calls = [];
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

async function getSession(name, del = false) {
    // Ok, we are passed in a "user" name.  First, we will check if it already exists...
    let gjwt = tokenGenerate(process.env.applicationId, keyfile, {});
    return new Promise(async (resolve, reject) => {
        var results;
        try {
            results = await axios.get('https://api.nexmo.com/v0.3/users/' + name + '/sessions',
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + gjwt
                    }
                });
            console.log("User Session Retrieval results: ", results.data);
            console.log(results.data?._embedded?.sessions);
            results.data?._embedded?.sessions.forEach((sess) => {
                console.log("Session: ", sess._embedded?.user)
            })
            resolve(results.data);
            return;
        } catch (err) {
            console.log("User Session retrieval error: ", err)
        }
    })
}
async function delSession(session) {
    // Ok, we are passed in a "session" 
    let gjwt = tokenGenerate(process.env.applicationId, keyfile, {});
    return new Promise(async (resolve, reject) => {

        var results;
        try {
            results = await axios.delete('https://api.nexmo.com/v0.3/sessions/' + session,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + gjwt
                    }
                });
            console.log("User Session Deletion results: ", results.data);
            resolve(results.data);
            return;
        } catch (err) {
            console.log("User Session deletion error: ", err)
        }
    })
}

async function getMember(name, conv) {
    let gjwt = tokenGenerate(process.env.applicationId, keyfile, {});
    return new Promise(async (resolve, reject) => {
        var results;
        try {
            results = await axios.get('https://api.nexmo.com/v0.3/conversations/' + conv + '/members/' + name,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + gjwt
                    }
                });
            console.log("getMember Retrieval results: ", results.data);
            resolve(results.data);
            return;
        } catch (err) {
            console.log("getMember retrieval error: ", err)
        }
    })
}
async function getUser(name) {
    let gjwt = tokenGenerate(process.env.applicationId, keyfile, {});
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
    let session = req.body.session;
    console.log("Deleting user: " + user + " with session: " + session);
    await delSession(session);
    delete agents[user];
    console.log("# of Agents: " + Object.keys(agents).length)
    return res.status(200).end();
})
app.post('/status', async (req, res) => {
    // When an Agent comes online, they will issue a "register" post, passing in the username in the POST body
    let user = req.body.user;
    console.log("Getting Status for user: " + user);
    if (user) {
        let resp = await getSession(user);
    }
    return res.status(200).end();
})
app.post('/mstatus', async (req, res) => {
    // When an Agent comes online, they will issue a "register" post, passing in the username in the POST body
    let user = req.body.user;
    let conv = req.body.conv;
    console.log("Getting Status for member: " + user);
    if (user && conv) {
        let resp = await getMember(user, conv);
    }
    return res.status(200).end();
})
app.post('/rtc', async (req, res) => {
    console.log("Got RTC event: ", req.body.type);
    if (req.body.type == 'text') {
        console.log(req.body);
    }
    return res.status(200).end();
})
app.post('/register', async (req, res) => {
    // When an Agent comes online, they will issue a "register" post, passing in the username in the POST body
    let user = req.body.user;
    let dept = req.body.dept ? req.body.dept : 'general';
    console.log("Creating user: " + user);
    // We will either get or create this user (depending on if it already exists or not)
    let userId = await getUser(user);
    console.log("Generating JWT for user: " + user)
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
    console.log("# of Agents: " + Object.keys(agents).length, agents)
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
                        address: url + "/voice/event?id=NONE",
                        http_method: "POST"
                    }
                },
            },
            rtc: {
                webhooks: {
                    event_url: {
                        address: url + "/rtc",
                        http_method: "POST"
                    }
                }
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
    let jwtExpiration = Math.round(new Date().getTime() / 1000) + 2592000; //30 days
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
        //ttl: 86400,
        acl: aclPaths,
    }
    // ONLY Client JWTs use a "sub", so don't add one if it isnlt passed in
    if (sub != null) {
        claims.sub = sub
    }
    console.log(process.env.applicationId, process.env.privateKey, claims);
    const jwt = tokenGenerate(process.env.applicationId, keyfile, claims)
    console.log("Jwt: ", jwt)
    return (jwt);
}

app.get('/', (req, res) => {
    console.log("Got to root.  Just to prove the tunnel works");
    res.sendStatus(200);
})

app.get('/voice/answer', (req, res) => {
    console.log('NCCO Answer request at ' + (Date().toLocaleString()) + ': ', req.query);
    console.log(`  - caller: ${req.query.from}`);
    console.log(`  - callee: ${req.query.to}`);
    console.log('---');

    let ncco = [];
    let names = [];
    if (req.query.from_user) {  // Hey!  Is coming from an InApp agent!!!  Connect to phone, in conversation
        ncco.push({
            action: "conversation",
            name: "Conv_" + req.query.uuid,
            endOnExit: true,
            startOnEnter: true,
        });
        calls[req.query.uuid] = req.query.to;
    }
    else if (!Object.keys(agents).length) {
        ncco.push({
            action: "talk",
            text: "There are currently no agents available. Please leave a message.",
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
        ncco.push({
            action: "talk",
            text: "Welcome to our helpline.",
            language: "en-US",
            style: 2,
            premium: true,
        }
        );
        let index = 1;
        for (var key in agents) {
            var agent = agents[key];
            console.log("Got agent " + agent.name)
            names.push(agent.name);
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
                    url + "/voice/ivr?from=" + req.query.from
                ],
                type: ["dtmf", "speech"],
                dtmf: {
                    maxDigits: 1
                },
                speech: {
                    context: names,
                    endOnSilence: 2,
                }
            }
        )
    }
    //////////////  Simplified, for testing... Just call John, no fancy stuff
    /*
        ncco = [{
            action: "talk",
            text: "Welcome to our helpline.",
            language: "en-US",
            style: 2,
            premium: true,
        }, {
            action: "connect",
            from: req.query.from,
            endpoint: [
                { type: "app", user: 'John' }
            ],
            eventUrl: [url + "/voice/event?id=FromConnect"]
    
        }];
    */
    /////////////
    console.log("Returning NCCO: ", ncco)
    console.log(names);
    return res.status(200).json(ncco);
})
app.all('/voice/event', (req, res) => {
    console.log('==========================================================================EVENT:', req.query.id);
    console.dir(req.body);
    if (req.body?.type == 'transfer' && calls[req.body.uuid]) {
        let ncco = [];
        ncco.push({
            action: "connect",
            //from: process.env.number,
            endpoint: [
                { type: "phone", number: calls[req.body.uuid] }
            ]
        })
        /*
        ncco.push({
            action: "conversation",
            name: "Conv_" + req.body.uuid,
            endOnExit: true,
        });
        */
        calls[req.body.uuid] = null;
        vonage.voice.transferCallWithNCCO(req.body.uuid,
            ncco
        )
            .then(resp => console.log(resp))
            .catch(err => console.error(err));
        console.log("Connecting with NCCO in transfer: ", ncco);
        return res.status(200);
    }
    res.sendStatus(200);
});
app.all('/voice/recordings', (req, res) => {
    console.log('Recording Event:');
    console.dir(req.body);
    console.log('---');
    if (req.body.recording_url) {
        let fname = req.body.recording_uuid + '.mp3';
        let gjwt = tokenGenerate(process.env.applicationId, keyfile, {});
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
app.all('/voice/transcript', (req, res) => {
    console.log('Transcription Event:', req.body);
    let gjwt = tokenGenerate(process.env.applicationId, keyfile, {});
    axios.get(req.body.transcription_url, {
        headers: {
            'Authorization': 'Bearer ' + gjwt,
            "content-type": "application/json",
        },
        json: true,
    }).then((result) => {
        console.log("Transcript (length = " + result.data.channels.length + "): ", result.data.channels[0].transcript[0].sentence)
        if (result.data.channels[0].transcript.length) {
            let msg = '';
            result.data.channels[0].transcript.forEach(obj => {
                msg += obj.sentence + "\r\n";
            });
            let fname = req.body.recording_uuid + '.txt';
            fs.writeFileSync(fname, msg);
            console.log("Saved transcription file: ", fname);
        }
    })
    res.sendStatus(200);
});

app.all('/voice/ivr', (req, res) => {
    console.log('IVR Event:');
    console.dir(req.body);
    console.log("Speech results: ", req.body.speech?.results)
    console.log('---');
    let ncco = [];
    let agent = null;
    if (req.body.dtmf?.digits) {
        let index = 1;
        for (var key in agents) {
            if (index == req.body.dtmf.digits) {
                agent = agents[key];
                break;
            }
            index++;
        }
        console.log("Found index " + req.body.dtmf.digits, agent)
    } else if (req.body.speech?.results?.length) {
        for (var key in agents) {
            let result = req.body.speech.results[0];
            console.log("Testing " + result.text.toLowerCase() + " if it contains " + agents[key].name.toLowerCase())
            if (result.text.toLowerCase().includes(agents[key].name.toLowerCase())) {
                agent = agents[key];
                console.log("Got it!")
                break;
            }
        }
    }
    if (agent) {
        ncco.push({
            action: "talk",
            text: "Now connecting you to " + agent.name,
            language: "en-US",
            style: 2,
            premium: true,
        }
        );
        ncco.push({
            action: "connect",
            from: req.query.from,
            endpoint: [
                { type: "app", user: agent.name }
            ]
        })
    } else {
        ncco.push({
            action: "talk",
            text: "Please leave a message at the beep.",
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
    }
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
    //setupWebhooks(url)
})();
