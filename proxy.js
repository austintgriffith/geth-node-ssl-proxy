const https = require("https");
const express = require("express");
const fs = require("fs");
var cors = require("cors");
var bodyParser = require("body-parser");
const app = express();

const { validateRpcRequest } = require('./utils/validateRpcRequest');
const { handleFallbackRequest } = require('./proxy_utils/handleFallbackRequest');

const { proxyPort } = require('./config');

const openMessages = new Map();

https.globalAgent.options.ca = require("ssl-root-cas").create(); // For sql connection

app.use(bodyParser.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Create the HTTPS server
const server = https.createServer(
  {
    key: fs.readFileSync("server.key"),
    cert: fs.readFileSync("server.cert"),
  },
  app
);

server.listen(proxyPort, () => {
  console.log("----------------------------------------------------------------------------------------------------------------");
  console.log("----------------------------------------------------------------------------------------------------------------");
  console.log(`HTTPS and WebSocket server listening on port ${proxyPort}...`);
});

app.post("/", validateRpcRequest, async (req, res) => {
  console.log("--------------------------------------------------------");
  console.log("📡 RPC REQUEST", req.body);

  await handleFallbackRequest(req, res, openMessages);

  console.log("POST SERVED", req.body);
});

module.exports = {
  app,
  openMessages
};