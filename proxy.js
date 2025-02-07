const https = require("https");
const express = require("express");
const fs = require("fs");
var cors = require("cors");
const axios = require('axios');
const { performance } = require('perf_hooks');
var bodyParser = require("body-parser");
const app = express();

const { validateRpcRequest } = require('./utils/validateRpcRequest');
const { handleRequest } = require('./utils/handleRequest');
const { handleCachedRequest } = require('./utils/handleCachedRequest');
const { logRequest } = require('./utils/logRequest');

const { proxyPortPublic } = require('./config');

const cachedMethods = ['eth_chainId', 'eth_blockNumber'];

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
    key: fs.readFileSync("/home/ubuntu/shared/server.key"),
    cert: fs.readFileSync("/home/ubuntu/shared/server.cert"),
  },
  app
);

server.listen(proxyPortPublic, () => {
  console.log("----------------------------------------------------------------------------------------------------------------");
  console.log("----------------------------------------------------------------------------------------------------------------");
  console.log(`HTTPS server listening on port ${proxyPortPublic}...`);
});

app.post("/", validateRpcRequest, async (req, res) => {
  console.log("-----------------------------------------------------------------------------------------");
  console.log("📡 RPC REQUEST", req.body);

  const startTime = performance.now();

  const now = new Date();
  const utcTimestamp = now.toISOString().replace('T', ' ').slice(0, 19);
  const epochTime = Math.floor(now.getTime());
  let status;

  if (cachedMethods.includes(req.body.method)) {
    status = await handleCachedRequest(req, res);
  } else {
    status = await handleRequest(req, res, 'fallback');
  }

  const duration = (performance.now() - startTime).toFixed(3);
 
  if (cachedMethods.includes(req.body.method)) {
    logRequest(req, epochTime, utcTimestamp, duration, status, 'cache');
  } else {
    logRequest(req, epochTime, utcTimestamp, duration, status, 'fallback');
  }

  if (status === "success") {
    console.log(`⏱️ Request took ${duration}ms to complete`);
  } else {
    console.log(`⏱️ Request took ${duration}ms to complete`);
    console.log(`⏱️ Request failed with status: ${status}`);
  }
  console.log("-----------------------------------------------------------------------------------------");
});

module.exports = {
  app,
};