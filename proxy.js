const https = require("https");
const express = require("express");
const fs = require("fs");
var cors = require("cors");
const { performance } = require('perf_hooks');
var bodyParser = require("body-parser");
const app = express();

const { validateRpcRequest } = require('./utils/validateRpcRequest');
const { handleFallbackRequest } = require('./proxy_utils/handleFallbackRequest');
const { logFallbackRequest } = require('./proxy_utils/logFallbackRequest');

const { proxyPort } = require('./config');
const { openMessages } = require('./globalMem');

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
  console.log(`Proxy.js: HTTPS server listening on port ${proxyPort}...`);
});

app.post("/", validateRpcRequest, async (req, res) => {
  console.log("-----------------------------------------------------------------------------------------");
  console.log("📡 RPC REQUEST", req.body);

  const startTime = performance.now();

  const now = new Date();
  const utcTimestamp = now.toISOString().replace('T', ' ').slice(0, 19);
  const epochTime = Math.floor(now.getTime() / 1000);

  const { status } = await handleFallbackRequest(req, res);

  const duration = (performance.now() - startTime).toFixed(3);

  logFallbackRequest(req, epochTime, utcTimestamp, duration, status);

  console.log(`⏱️ Request took ${duration}ms to complete`);
  console.log("-----------------------------------------------------------------------------------------");
});

module.exports = {
  app,
  openMessages
};