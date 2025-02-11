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
  let requestType;
  let response;

  try {
    if (cachedMethods.includes(req.body.method)) {
      status = await handleCachedRequest(req, res);
      requestType = 'cache';
    } else {
      // Try pool first
      const poolResult = await handleRequest(req, res, 'pool');
      requestType = 'pool';
      
      if (poolResult.success) {
        response = poolResult.data;
        status = "success";
      } else {
        // Pool failed, try fallback
        console.log("🔄 Pool request failed, trying fallback...");
        const fallbackResult = await handleRequest(req, res, 'fallback');
        requestType = 'fallback';
        
        if (fallbackResult.success) {
          response = fallbackResult.data;
          status = "success";
        } else {
          // Both pool and fallback failed
          response = fallbackResult.error;
          status = "error";
        }
      }
    }

    const duration = (performance.now() - startTime).toFixed(3);
    logRequest(req, epochTime, utcTimestamp, duration, status, requestType);

    // Only send response after all attempts are complete
    if (status === "success") {
      console.log(`⏱️ Request completed in ${duration}ms with status: ${status}`);
      res.json(response);
    } else {
      console.log(`❌ Request failed after ${duration}ms`);
      res.status(500).json(response);
    }
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(3);
    status = "error";
    
    // Simplified error logging
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.log(`❌ Request failed after ${duration}ms: ${errorMessage}`);
    
    logRequest(req, epochTime, utcTimestamp, duration, status, requestType || 'unknown');

    // Send error response
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body.id,
      error: {
        code: -32603,
        message: errorMessage
      }
    });
  }
  console.log("-----------------------------------------------------------------------------------------");
});

module.exports = {
  app,
};