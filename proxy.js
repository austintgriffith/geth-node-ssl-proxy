const https = require("https");
const express = require("express");
const fs = require("fs");
var cors = require("cors");
const { performance } = require('perf_hooks');
var bodyParser = require("body-parser");
const app = express();
const internalApp = express();
const TelegramBot = require("node-telegram-bot-api");

require("dotenv").config();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS
  ? process.env.TELEGRAM_CHAT_IDS.split(",").map((id) => id.trim())
  : [];
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const { validateRpcRequest } = require('./utils/validateRpcRequest');
const { handleRequest } = require('./utils/handleRequest');
const { handleCachedRequest, subscribeToCacheUpdates, getCacheMap } = require('./utils/handleCachedRequest');
const { logRequest } = require('./utils/logRequest');

const { proxyPortPublic, proxyPort } = require('./config');
const { ignoredErrorCodes } = require('../shared/ignoredErrorCodes');

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

function sendTelegramAlert(message) {
  TELEGRAM_CHAT_IDS.forEach((chatId) => {
    telegramBot
      .sendMessage(chatId, message)
      .then(() => console.log(`Telegram alert sent to ${chatId}!`))
      .catch((err) =>
        console.error(`Telegram alert error for ${chatId}:`, err)
      );
  });
}

app.post("/", validateRpcRequest, async (req, res) => {
  console.log("-----------------------------------------------------------------------------------------");
  // DON't delete this
  console.log("📡 RPC REQUEST", req.body);
  // console.log("📡 HEADERS:", req.headers);

  // Create a deep copy of just the necessary request properties
  // Used for fallback requests b/c don't know if officebox is on the same block as pool nodes
  const reqOriginal = req;

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
    
    // Transform the params and update the original request body
    const transformedParams = transformLatestToBlockNumber(req.body.method, params, cacheMap);
    req.body.params = transformedParams;
    req.body.jsonrpc = "2.0"; // Ensure JSON-RPC version is set
    req.body.id = req.body.id; // Ensure ID is set

    // Update content-length header to match new body length
    const newBodyString = JSON.stringify(req.body);
    req.headers['content-length'] = Buffer.byteLength(newBodyString);

    // Don't delete this
    // console.log("📡 New Req.headers:", req.headers);
    console.log("📡 New Req.body:", req.body);

    // Check if method is cached and parameters match
    const cacheKey = `${req.body.method}:${JSON.stringify(transformedParams)}`;
    const isCachedMethod = cacheMap.has(cacheKey);

    if (isCachedMethod) {
      try {
        const cacheStartTime = performance.now();
        const cacheResult = await handleCachedRequest(req.body, res);
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
          
          if (poolResult.success) {
            requestType = 'pool';
            response = poolResult.data;
            status = "success";
          } else if (
            poolResult.error &&
            poolResult.error.error &&
            ignoredErrorCodes.includes(poolResult.error.error.code)
          ) {
            // Do NOT try fallback for execution reverted
            response = poolResult.error;
            status = "error";
            const errorCode = poolResult.error.error.code;
            console.log(`⛔ Ignored Error code: ${errorCode}, not retrying with fallback.`);
          } else {
            // Pool failed, try fallback
            console.log("🔄 Pool request failed, trying fallback...");
            const fallbackStartTime = performance.now();
            const fallbackResult = await handleRequest(reqOriginal, res, 'fallback');
            const fallbackDuration = (performance.now() - fallbackStartTime).toFixed(3);
            
            // Log fallback attempt - only include full details for errors
            logRequest(reqOriginal, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : fallbackResult.error, 'fallback');
            
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
        
        if (poolResult.success) {
          requestType = 'pool';
          response = poolResult.data;
          status = "success";
        } else if (
          poolResult.error &&
          poolResult.error.error &&
          ignoredErrorCodes.includes(poolResult.error.error.code)
        ) {
          // Do NOT try fallback for execution reverted
          response = poolResult.error;
          status = "error";
          const errorCode = poolResult.error.error.code;
          console.log(`⛔ Ignored Error code: ${errorCode}, not retrying with fallback.`);
        } else {
          // Pool failed, try fallback
          console.log("🔄 Pool request failed, trying fallback...");
          const fallbackStartTime = performance.now();
          const fallbackResult = await handleRequest(reqOriginal, res, 'fallback');
          const fallbackDuration = (performance.now() - fallbackStartTime).toFixed(3);
          
          // Log fallback attempt - only include full details for errors
          logRequest(reqOriginal, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : fallbackResult.error, 'fallback');
          
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
      } else if (
        poolResult.error &&
        poolResult.error.error &&
        ignoredErrorCodes.includes(poolResult.error.error.code)
      ) {
        // Do NOT try fallback for execution reverted
        response = poolResult.error;
        status = "error";
        const errorCode = poolResult.error.error.code;
        console.log(`⛔ Ignored Error code: ${errorCode}, not retrying with fallback.`);
      } else {
        // Pool failed, try fallback
        console.log("🔄 Pool request failed, trying fallback...");
        const fallbackStartTime = performance.now();
        const fallbackResult = await handleRequest(reqOriginal, res, 'fallback');
        const fallbackDuration = (performance.now() - fallbackStartTime).toFixed(3);
        
        // Log fallback attempt - only include full details for errors
        logRequest(reqOriginal, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : fallbackResult.error, 'fallback');
        
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
      sendTelegramAlert(`Proxy.js Request completed: ${JSON.stringify(response, null, 2)}`);
    } else {
      console.log(`❌ Request failed`);
      res.status(200).json(response);
    }
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(3);
    
    // Create proper error response object
    const errorResponse = {
      jsonrpc: "2.0",
      id: req.body.id,
      error: {
        code: -70000,
        message: "Internal Proxy error",
        data: error.response?.data?.error?.message || error.message
      }
    };
    
    logRequest(req, epochTime, utcTimestamp, duration, errorResponse, requestType);

    // Send error response
    // TODO: Should this actually be 500?
    res.status(200).json(errorResponse);
  }
  console.log("-----------------------------------------------------------------------------------------");
});

module.exports = {
  app,
};