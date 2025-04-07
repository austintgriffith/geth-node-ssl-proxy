const https = require("https");
const express = require("express");
const fs = require("fs");
var cors = require("cors");
const { performance } = require('perf_hooks');
var bodyParser = require("body-parser");
const app = express();
const internalApp = express();

const { validateRpcRequest } = require('./utils/validateRpcRequest');
const { handleRequest } = require('./utils/handleRequest');
const { handleCachedRequest, subscribeToCacheUpdates, getCacheMap } = require('./utils/handleCachedRequest');
const { logRequest } = require('./utils/logRequest');

const { proxyPortPublic, proxyPort } = require('./config');

// Initialize with empty array, will be updated by cache service
let cachedMethods = [];

// Subscribe to cache updates
subscribeToCacheUpdates((methods) => {
  cachedMethods = methods;
});

https.globalAgent.options.ca = require("ssl-root-cas").create(); // For sql connection

app.use(bodyParser.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Function to transform latest to block number if conditions are met
function transformLatestToBlockNumber(method, params, cacheMap) {
  // Check if params contains "latest"
  const latestIndex = params.findIndex(param => param === "latest");
  if (latestIndex === -1) return params;

  // Check if eth_blockNumber is in cache
  const blockNumberKey = `${'eth_blockNumber'}:${JSON.stringify([])}`;
  const blockNumberEntry = cacheMap.get(blockNumberKey);
  if (!blockNumberEntry) return params;

  // Check if block number is less than 15 seconds old
  const now = Date.now();
  if (now - blockNumberEntry.timestamp > 15000) return params;

  // Transform latest to block number
  const transformedParams = [...params];
  const blockNumber = blockNumberEntry.value;
  console.log("🔍 Block number format:", {
    original: blockNumber,
    type: typeof blockNumber,
    isHex: blockNumber.startsWith('0x'),
    length: blockNumber.length
  });
  
  transformedParams[latestIndex] = blockNumber;
  return transformedParams;
}

// Create the internal HTTPS server for cacheMap endpoint
const internalServer = https.createServer(
  {
    key: fs.readFileSync("/home/ubuntu/shared/server.key"),
    cert: fs.readFileSync("/home/ubuntu/shared/server.cert"),
  },
  internalApp
);

// Endpoint to get cache map data on internal port
internalApp.get("/cacheMap", (req, res) => {
  const cacheMap = getCacheMap();
  const cacheData = Object.fromEntries(cacheMap);
  res.json(cacheData);
});

internalServer.listen(proxyPort, () => {
  console.log(`Internal HTTPS server listening on port ${proxyPort}...`);
});

// Create the public HTTPS server
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
    // Transform latest to block number if conditions are met
    const cacheMap = getCacheMap();
    const params = req.body.params === undefined ? [] : req.body.params;
    
    // Create a deep copy of the request body to avoid modifying the original
    const requestBody = JSON.parse(JSON.stringify(req.body));
    const transformedParams = transformLatestToBlockNumber(requestBody.method, params, cacheMap);
    
    // Update request body with transformed params while maintaining JSON-RPC format
    requestBody.params = transformedParams;
    requestBody.jsonrpc = "2.0"; // Ensure JSON-RPC version is set
    requestBody.id = requestBody.id; // Ensure ID is set

    console.log("🔄 Transformed request:", requestBody);

    // Check if method is cached and parameters match
    const cacheKey = `${requestBody.method}:${JSON.stringify(transformedParams)}`;
    const isCachedMethod = cacheMap.has(cacheKey);

    if (isCachedMethod) {
      try {
        const cacheStartTime = performance.now();
        const cacheResult = await handleCachedRequest(requestBody, res);
        const cacheDuration = (performance.now() - cacheStartTime).toFixed(3);
        
        // Log cache attempt - only include full details for errors
        logRequest(req, epochTime, utcTimestamp, cacheDuration, cacheResult.success ? "success" : cacheResult.error, 'cache');
        
        if (cacheResult.success) {
          requestType = 'cache';
          response = cacheResult.data;
          status = "success";
        } else {
          // Cache failed, try pool
          console.log("🔄 Cache request failed, trying pool...");
          const poolStartTime = performance.now();
          const poolResult = await handleRequest(req, res, 'pool');
          const poolDuration = (performance.now() - poolStartTime).toFixed(3);
          
          // Log pool attempt - only include full details for errors
          logRequest(req, epochTime, utcTimestamp, poolDuration, poolResult.success ? "success" : poolResult.error, 'pool');
          
          requestType = 'pool';
          if (poolResult.success) {
            response = poolResult.data;
            status = "success";
          } else {
            // Pool failed, try fallback
            console.log("🔄 Pool request failed, trying fallback...");
            const fallbackStartTime = performance.now();
            const fallbackResult = await handleRequest(req, res, 'fallback');
            const fallbackDuration = (performance.now() - fallbackStartTime).toFixed(3);
            
            // Log fallback attempt - only include full details for errors
            logRequest(req, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : fallbackResult.error, 'fallback');
            
            requestType = 'fallback';
            if (fallbackResult.success) {
              response = fallbackResult.data;
              status = "success";
            } else {
              response = fallbackResult.error;
              status = "error";
            }
          }
        }
      } catch (cacheError) {
        // Log cache error with full error details
        const cacheDuration = (performance.now() - startTime).toFixed(3);
        logRequest(req, epochTime, utcTimestamp, cacheDuration, cacheError.message, 'cache');
        
        // Cache threw an error, try pool
        console.log("🔄 Cache request error, trying pool...", cacheError);
        const poolStartTime = performance.now();
        const poolResult = await handleRequest(req, res, 'pool');
        const poolDuration = (performance.now() - poolStartTime).toFixed(3);
        
        // Log pool attempt - only include full details for errors
        logRequest(req, epochTime, utcTimestamp, poolDuration, poolResult.success ? "success" : poolResult.error, 'pool');
        
        requestType = 'pool';
        if (poolResult.success) {
          response = poolResult.data;
          status = "success";
        } else {
          // Pool failed, try fallback
          console.log("🔄 Pool request failed, trying fallback...");
          const fallbackStartTime = performance.now();
          const fallbackResult = await handleRequest(req, res, 'fallback');
          const fallbackDuration = (performance.now() - fallbackStartTime).toFixed(3);
          
          // Log fallback attempt - only include full details for errors
          logRequest(req, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : fallbackResult.error, 'fallback');
          
          requestType = 'fallback';
          if (fallbackResult.success) {
            response = fallbackResult.data;
            status = "success";
          } else {
            response = fallbackResult.error;
            status = "error";
          }
        }
      }
    } else {
      // Non-cached methods: Try pool first
      const poolStartTime = performance.now();
      const poolResult = await handleRequest(req, res, 'pool');
      const poolDuration = (performance.now() - poolStartTime).toFixed(3);
      
      // Log pool attempt - only include full details for errors
      logRequest(req, epochTime, utcTimestamp, poolDuration, poolResult.success ? "success" : poolResult.error, 'pool');
      
      requestType = 'pool';
      if (poolResult.success) {
        response = poolResult.data;
        status = "success";
      } else {
        // Pool failed, try fallback
        console.log("🔄 Pool request failed, trying fallback...");
        const fallbackStartTime = performance.now();
        const fallbackResult = await handleRequest(req, res, 'fallback');
        const fallbackDuration = (performance.now() - fallbackStartTime).toFixed(3);
        
        // Log fallback attempt - only include full details for errors
        logRequest(req, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : fallbackResult.error, 'fallback');
        
        requestType = 'fallback';
        if (fallbackResult.success) {
          response = fallbackResult.data;
          status = "success";
        } else {
          response = fallbackResult.error;
          status = "error";
        }
      }
    }

    // Only send response after all attempts are complete
    if (status === "success") {
      console.log(`⏱️ Request completed with status: ${status}`);
      res.json(response);
    } else {
      console.log(`❌ Request failed`);
      res.status(500).json(response);
    }
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(3);
    
    // Create proper error response object
    const errorResponse = {
      jsonrpc: "2.0",
      id: req.body.id,
      error: {
        code: -32603,
        message: "Internal error",
        data: error.response?.data?.error?.message || error.message
      }
    };
    
    logRequest(req, epochTime, utcTimestamp, duration, errorResponse, requestType);

    // Send error response
    res.status(500).json(errorResponse);
  }
  console.log("-----------------------------------------------------------------------------------------");
});

module.exports = {
  app,
};