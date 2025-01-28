const express = require("express");
const https = require("https");
const fs = require("fs");
const app = express();

const { webServerPort } = require('./config');

const proxyurlRouter = require('./routes/proxyurl');
app.use(proxyurlRouter);

// Create the HTTPS server
const server = https.createServer(
  {
    key: fs.readFileSync("server.key"),
    cert: fs.readFileSync("server.cert"),
  },
  app
);

// Start the HTTPS server
server.listen(webServerPort, () => {
  console.log(`HTTPS Web server listening on port ${webServerPort}...`);
});