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

// DO NOT DELETE THIS CODE
// const cachedMethods = ['eth_chainId', 'eth_blockNumber'];
const cachedMethods = ['foo'];

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
  let requestType;

  try {
    if (cachedMethods.includes(req.body.method)) {
      status = await handleCachedRequest(req, res);
      requestType = 'cache';
    } else {
      // Try pool first
      status = await handleRequest(req, res, 'pool');
      requestType = 'pool';

      // If pool fails, try fallback
      if (status !== 'success') {
        console.log("🔄 Pool request failed, trying fallback...");
        status = await handleRequest(req, res, 'fallback');
        requestType = 'fallback';
      }
    }

    const duration = (performance.now() - startTime).toFixed(3);
    logRequest(req, epochTime, utcTimestamp, duration, status, requestType);

    console.log(`⏱️ Request completed in ${duration}ms with status: ${status}`);
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(3);
    status = "error";
    
    // Simplified error logging
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.log(`❌ Request failed after ${duration}ms: ${errorMessage}`);
    
    logRequest(req, epochTime, utcTimestamp, duration, status, requestType || 'unknown');
  }
  console.log("-----------------------------------------------------------------------------------------");
});

module.exports = {
  app,
};