# AppInFromPSTN

Aside from the ususal "npm install"...

You will need to create an environment file:
.env
on your server, in the same directory as "server.js"
This will contain 5 pieces of information..
apiKey   -   Your Vonage API Key
apiSecret  -  Your Vonage API Secret
applicationId  -  The ApplicationID you created using this Key
privateKey --  the LOCATION of the private key file (usually "./private.key"), generated when you created the ApplicationID
number  -   Your Vonage Phone Number (LVN) associated with this ApplicationID

There is a file, sample_env, which shows the format/keys you will need in the .env file


You set your "local tunnel" name in the server.js at line 4:

const subdomain = 'mbphonetoapp';

The server will AUTOMATICALLY set your Vonage Voice webhooks (answer and event) based on this... NO NEED to set/change it in the dashboard!

The Server now has a "register" function.  The client, when launching, will "register" their username with the server.
The server will AUTOMATICALLY create the Vonage "user" (or, if it already exists, use the existing one).  It will ALSO automatically create the client's JWT.
This means that you DO NOT NEED to create the User OR the JWT in the Vonage CLI/Dashboard.  This server code does all that automatically.


In the client, point to your backend tunnel at line 21:

const base_url = "https://mbphonetoapp.loca.lt/";

The client code is self-contained: you can just plu the file location into your browser, eg:

file:///Users/mberkeland/sandbox/demos/ecw/client.html
(or whatever the path to the client file is on your system)

You will see a field for the Username.. fill it in (one word, no spaces), and hit "register"
You can look at the console output to see the info you are getting back from the server.  We use this info to create the client Nexmo object (using the appropriate JWT Token and DataCenter).

That's it!  You can now call the number associated with the Application, and your client should receive it on the web.



