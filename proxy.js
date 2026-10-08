const https = require("https");
const express = require("express");
const fs = require("fs");
var cors = require("cors");
const { performance } = require('perf_hooks');
var bodyParser = require("body-parser");
const compression = require("compression");
const zlib = require("zlib");
const app = express();
const internalApp = express();

require("dotenv").config();

const { validateRpcRequest } = require('./utils/validateRpcRequest');
const { handleRequest, fetchGetLogsStatus } = require('./utils/handleRequest');
const { handleCachedRequest, subscribeToCacheUpdates, getCacheMap } = require('./utils/handleCachedRequest');
const { logRequest, logMergedRequest, callerOf } = require('./utils/logRequest');
const { mergeKey, withId, createMerger } = require('./utils/requestMerge');
const { runBatch } = require('./utils/runBatch');
const { sendTelegramAlert } = require('./utils/telegramUtils');

const { proxyPortPublic, proxyPort, fallbackRateAlertThreshold, methodsNeverFallback, methodsKeepLatest, maxRequestBodySize, batchConcurrency, mergeMaxFollowers } = require('./config');
const { ignoredErrorCodes } = require('../shared/ignoredErrorCodes');
const { callerErrorReason } = require('./utils/fallbackPolicy');

// Initialize with empty array, will be updated by cache service
let cachedMethods = [];

// Subscribe to cache updates
subscribeToCacheUpdates((methods) => {
  cachedMethods = methods;
});

https.globalAgent.options.ca = require("ssl-root-cas").create(); // For sql connection

// Compress responses over 1 KB when the caller asks (Accept-Encoding); brotli is preferred
// when offered. Fastest settings: on a 4.1 MB getLogs body brotli q1 took 7 ms for 12x and
// gzip level 1 16 ms for 10x (the package's default brotli q4: 25 ms for 14x).
app.use(compression({
  threshold: 1024,
  level: zlib.constants.Z_BEST_SPEED,
  brotli: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 1 } },
}));
app.use(bodyParser.json({ limit: maxRequestBodySize }));
// Body-parser failures answer as JSON-RPC, not Express's HTML error page
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Request body too large (max ${maxRequestBodySize})` } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  next(err);
});
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Function to transform latest to block number if conditions are met
function transformLatestToBlockNumber(method, params, cacheMap) {
  // By-name (object) params are passed through untouched; the node validates them
  if (!Array.isArray(params)) return params;
  // Head-only methods: the node resolves "latest" itself
  if (methodsKeepLatest.includes(method)) return params;

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

// Track fallback request timestamps for rate monitoring
const fallbackTimestamps = [];
// Track last alert time to avoid spamming alerts
let lastFallbackAlertTime = 0;

function checkFallbackRateAndAlert() {
  const now = Date.now();
  // Remove timestamps older than 1 hour
  while (fallbackTimestamps.length && fallbackTimestamps[0] < now - 60 * 60 * 1000) {
    fallbackTimestamps.shift();
  }
  if (
    fallbackTimestamps.length > fallbackRateAlertThreshold &&
    (now - lastFallbackAlertTime > 60 * 60 * 1000)
  ) {
    try {
      // Do not delete this line
      // sendTelegramAlert(`\n------------------------------------------\n🚨 More than ${fallbackRateAlertThreshold} fallback requests in the last hour`);
    } catch (telegramError) {
      console.error("❌ Error sending telegram alert:", telegramError.message);
    }
    lastFallbackAlertTime = now;
  }
}

// Simple function to validate and return fallback response or alert if invalid JSON
function validateFallbackResponse(response, originalRequest) {
  try {
    // Try to stringify and parse to ensure valid JSON
    if (typeof response === 'object') {
      JSON.stringify(response);
      return response;
    }
    if (typeof response === 'string') {
      return JSON.parse(response);
    }
    throw new Error('Response is not valid JSON');
  } catch (error) {
    console.log('🚨 Invalid JSON from fallback provider:', response);
    try {
      sendTelegramAlert(`🚨 INVALID JSON FROM FALLBACK\nRequest: ${JSON.stringify(originalRequest)}\nResponse: ${response}\nError: ${error.message}`);
    } catch (telegramError) {
      console.error("❌ Error sending telegram alert:", telegramError.message);
    }
    return response; // Return original response even if invalid
  }
}

// getLogs readiness for the edge, which can only reach this port
app.get("/getlogsStatus", async (req, res) => {
  try {
    res.json(await fetchGetLogsStatus());
  } catch (error) {
    console.error("❌ /getlogsStatus: pool unreachable:", error.message);
    res.status(502).json({ error: "pool unreachable" });
  }
});

// Returns why a failed pool request must not go to the fallback, or null if it may
function noFallbackReason(method, poolResult, request) {
  if (methodsNeverFallback.includes(method)) {
    return `${method} never uses fallback`;
  }
  const errorCode = poolResult.error?.error?.code;
  if (errorCode !== undefined && ignoredErrorCodes.includes(errorCode)) {
    return `Ignored Error code: ${errorCode}`;
  }
  // A caller's mistake fails on the fallback too (utils/fallbackPolicy.js)
  const head = getCacheMap().get(`eth_blockNumber:${JSON.stringify([])}`)?.value;
  const reason = callerErrorReason(poolResult.error?.error, head ? parseInt(head, 16) : null, request);
  return reason ? `Caller error: ${reason}` : null;
}

// Watchdog endpoint for health checks
app.get("/watchdog", (req, res) => {
  res.json({ ok: true });
});

// The cache-miss path: the pool, then the fallback when the fallback policy allows it. Logs its own
// pool / fallback lines. Returns { requestType, response, status }.
async function poolThenFallback(req, reqOriginal, epochTime, utcTimestamp) {
  let requestType;
  let response;
  let status;
  const poolStartTime = performance.now();
  const poolResult = await handleRequest(req, null, 'pool'); // Pass null for res
  const poolDuration = (performance.now() - poolStartTime).toFixed(3);
  
  // Log pool attempt - only include full details for errors
  logRequest(req, epochTime, utcTimestamp, poolDuration, poolResult.success ? "success" : poolResult.error, 'pool');
  
  requestType = 'pool';
  if (poolResult.success) {
    response = poolResult.data;
    status = "success";
  } else if (noFallbackReason(req.body.method, poolResult, req.body)) {
    // Do NOT try fallback for execution reverted etc. or for heavy methods
    response = poolResult.error;
    status = "error";
    console.log(`⛔ ${noFallbackReason(req.body.method, poolResult, req.body)}, not retrying with fallback.`);
  } else {
    // Pool failed, try fallback
    console.log("🔄 Pool request failed, trying fallback...");
    const fallbackStartTime = performance.now();
    const fallbackResult = await handleRequest(reqOriginal, null, 'fallback'); // Pass null for res
    const fallbackDuration = (performance.now() - fallbackStartTime).toFixed(3);
    
    // Log fallback attempt - only include full details for errors
    logRequest(reqOriginal, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : fallbackResult.error, 'fallback');
    
    requestType = 'fallback';
    if (fallbackResult.success) {
      response = validateFallbackResponse(fallbackResult.data, reqOriginal.body);
      status = "success";
      fallbackTimestamps.push(Date.now());
      checkFallbackRateAndAlert();
    } else {
      response = fallbackResult.error;
      status = "error";
      fallbackTimestamps.push(Date.now());
      checkFallbackRateAndAlert();
    }
  }
  return { requestType, response, status };
}

// Identical requests in flight share one pool request (utils/requestMerge.js)
const merger = createMerger({ maxFollowers: mergeMaxFollowers });

// Our failure (may not be shared with merged requests): any failure the fallback policy doesn't call
// the caller's own mistake, the same rule as the alerts below
function isOurFailure(req, outcome) {
  return outcome.status !== 'success' && !noFallbackReason(req.body.method, { error: outcome.response }, req.body);
}

// Extract single request processing logic into a reusable function
async function processSingleRequest(req) {
  const { jsonrpc, id, method } = req.body;
  console.log("📡 RPC REQUEST", { jsonrpc, id, method });

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

    console.log("📡 New Req.body:", { jsonrpc: req.body.jsonrpc, id: req.body.id, method: req.body.method });

    // Check if method is cached and parameters match
    const cacheKey = `${req.body.method}:${JSON.stringify(transformedParams)}`;
    const isCachedMethod = cacheMap.has(cacheKey);

    if (isCachedMethod) {
      try {
        const cacheStartTime = performance.now();
        const cacheResult = await handleCachedRequest(req.body, null); // Pass null for res since we're returning response
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
          const poolResult = await handleRequest(req, null, 'pool'); // Pass null for res
          const poolDuration = (performance.now() - poolStartTime).toFixed(3);
          
          // Log pool attempt - only include full details for errors
          logRequest(req, epochTime, utcTimestamp, poolDuration, poolResult.success ? "success" : poolResult.error, 'pool');
          
          if (poolResult.success) {
            requestType = 'pool';
            response = poolResult.data;
            status = "success";
          } else if (noFallbackReason(req.body.method, poolResult, req.body)) {
            // Do NOT try fallback for execution reverted etc. or for heavy methods
            response = poolResult.error;
            status = "error";
            console.log(`⛔ ${noFallbackReason(req.body.method, poolResult, req.body)}, not retrying with fallback.`);
          } else {
            // Pool failed, try fallback
            console.log("🔄 Pool request failed, trying fallback...");
            const fallbackStartTime = performance.now();
            const fallbackResult = await handleRequest(reqOriginal, null, 'fallback'); // Pass null for res
            const fallbackDuration = (performance.now() - fallbackStartTime).toFixed(3);
            
            // Log fallback attempt - only include full details for errors
            logRequest(reqOriginal, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : fallbackResult.error, 'fallback');
            
            requestType = 'fallback';
            if (fallbackResult.success) {
              response = validateFallbackResponse(fallbackResult.data, reqOriginal.body);
              status = "success";
              fallbackTimestamps.push(Date.now());
              checkFallbackRateAndAlert();
            } else {
              response = fallbackResult.error;
              status = "error";
              fallbackTimestamps.push(Date.now());
              checkFallbackRateAndAlert();
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
        const poolResult = await handleRequest(req, null, 'pool'); // Pass null for res
        const poolDuration = (performance.now() - poolStartTime).toFixed(3);
        
        // Log pool attempt - only include full details for errors
        logRequest(req, epochTime, utcTimestamp, poolDuration, poolResult.success ? "success" : poolResult.error, 'pool');
        
        if (poolResult.success) {
          requestType = 'pool';
          response = poolResult.data;
          status = "success";
        } else if (noFallbackReason(req.body.method, poolResult, req.body)) {
          // Do NOT try fallback for execution reverted etc. or for heavy methods
          response = poolResult.error;
          status = "error";
          console.log(`⛔ ${noFallbackReason(req.body.method, poolResult, req.body)}, not retrying with fallback.`);
        } else {
          // Pool failed, try fallback
          console.log("🔄 Pool request failed, trying fallback...");
          const fallbackStartTime = performance.now();
          const fallbackResult = await handleRequest(reqOriginal, null, 'fallback'); // Pass null for res
          const fallbackDuration = (performance.now() - fallbackStartTime).toFixed(3);
          
          // Log fallback attempt - only include full details for errors
          logRequest(reqOriginal, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : fallbackResult.error, 'fallback');
          
          requestType = 'fallback';
          if (fallbackResult.success) {
            response = validateFallbackResponse(fallbackResult.data, reqOriginal.body);
            status = "success";
            fallbackTimestamps.push(Date.now());
            checkFallbackRateAndAlert();
          } else {
            response = fallbackResult.error;
            status = "error";
            fallbackTimestamps.push(Date.now());
            checkFallbackRateAndAlert();
          }
        }
      }
    } else {
      // Cache miss: the pool, then the fallback when allowed. An identical request already in
      // flight is shared instead of sent again (utils/requestMerge.js)
      const runOwn = () => poolThenFallback(req, reqOriginal, epochTime, utcTimestamp);
      const key = mergeKey(req.body.method, req.body.params);
      if (key) {
        const merged = await merger.run(key, runOwn, { isOurFailure: (outcome) => isOurFailure(req, outcome), caller: callerOf(req) });
        ({ requestType, response, status } = merged.outcome);
        if (merged.role === 'follower') {
          // Never touched a node: a cache hit for the dashboard, plus one line in mergedRequests.log
          response = withId(response, req.body.id);
          requestType = 'cache';
          console.log(`🔗 merged into in-flight ${req.body.method} (waited ${merged.waitMs} ms${merged.sameCaller ? ', same caller' : ''})`);
          logRequest(req, epochTime, utcTimestamp, merged.waitMs, status === 'success' ? 'success' : response, 'cache');
          logMergedRequest(req, epochTime, utcTimestamp, merged.waitMs, merged.leaderEpoch, merged.sameCaller);
        } else if (merged.role === 'own') {
          console.log(`🔗 ${req.body.method} not merged: ${merged.reason}`);
        }
      } else {
        ({ requestType, response, status } = await runOwn());
      }
    }
    
    // Handle response and alerts
    if (status === "success") {
      console.log(`⏱️ Request completed with status: ${status}`);
      // Don't delete this line
      // console.log("📡 Response:", response);
      return response;      
    } else {
      console.log(`❌ Request failed`);
      // Alert only for our failures. A caller's mistake (ignored codes, heavy methods, node
      // errors that aren't about our infrastructure: utils/fallbackPolicy.js) is the answer,
      // not an incident; alerting on it flooded Telegram once those stopped falling back.
      const notOurFailure = noFallbackReason(req.body.method, { error: response }, req.body);
      if (notOurFailure) {
        console.log(`🔕 No alert: ${notOurFailure}`);
        return response;
      }
      // Pass error code if available
      const errorCode = response && response.error && typeof response.error.code !== 'undefined' ? response.error.code : undefined;
      try {
        sendTelegramAlert(`\n------------------------------------------\n🚨 RPC Request Failed\n\nRequest:\n${JSON.stringify(req.body, null, 2)}\n\nResponse:\n${JSON.stringify(response, null, 2)}`, errorCode, req.body.method);
      } catch (telegramError) {
        console.error("❌ Error sending telegram alert:", telegramError.message);
      }
      return response;
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
    // Pass error code if available
    try {
      sendTelegramAlert(`\n------------------------------------------\n🚨 RPC Request Failed\n\nRequest:\n${JSON.stringify(req.body, null, 2)}\n\nResponse:\n${JSON.stringify(errorResponse, null, 2)}`, errorResponse.error.code, req.body.method);
    } catch (telegramError) {
      console.error("❌ Error sending telegram alert:", telegramError.message);
    }

    return errorResponse;
  }
}

app.post("/", validateRpcRequest, async (req, res) => {
  console.log("-----------------------------------------------------------------------------------------");
  
  // Check if this is a batch request (array of requests)
  if (Array.isArray(req.body)) {
    console.log("🔄 Processing batch request with", req.body.length, "requests");
    
    const items = req.body;
    // Items run concurrently, at most batchConcurrency at a time, and are answered in order. If the
    // caller disconnects (e.g. the edge gave up after its timeout), items not yet started are skipped
    // instead of making the nodes do work nobody will receive (independent audit HB1: nodes ran all
    // 10 items of a batch the caller had abandoned at 12 s)
    let callerGone = false;
    res.on('close', () => { if (!res.writableEnded) callerGone = true; });

    const { answers: batchResponses, skipped } = await runBatch(items, async (individualRequest, i) => {
      // An invalid item was answered by validateRpcRequest; the rest of the batch still runs
      if (req.batchErrors?.has(i)) return req.batchErrors.get(i);
      console.log(`📦 Processing batch request ${i + 1}/${items.length}:`, individualRequest);

      // Create a new request object for this individual request
      // We need to preserve the Express request methods like req.get()
      const individualReq = Object.create(req);
      individualReq.body = individualRequest;

      try {
        // Process this individual request using the extracted logic
        return await processSingleRequest(individualReq);
      } catch (error) {
        // If individual request fails, create error response
        return {
          jsonrpc: "2.0",
          id: individualRequest.id,
          error: {
            code: -70000,
            message: "Internal Proxy error",
            data: error.message
          }
        };
      }
    }, { concurrency: batchConcurrency, isCancelled: () => callerGone });

    if (callerGone) {
      console.log(`🛑 Caller disconnected; skipped ${skipped} of ${items.length} batch items`);
      return;
    }
    
    console.log("📦 Batch request completed, returning", batchResponses.length, "responses");
    res.json(batchResponses);
  } else {
    // Handle single request (existing logic)
    try {
      const response = await processSingleRequest(req);
      res.json(response);
    } catch (error) {
      // Create proper error response object
      const errorResponse = {
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
          code: -70000,
          message: "Internal Proxy error",
          data: error.message
        }
      };
      res.status(200).json(errorResponse);
    }
  }
  
  console.log("-----------------------------------------------------------------------------------------");
});

// Anything that still throws answers JSON-RPC, never Express's HTML page (which carried a
// stack trace with server paths)
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  if (res.headersSent) return next(err);
  const error = { code: -70000, message: "Internal Proxy error" };
  const body = Array.isArray(req.body)
    ? req.body.map(item => ({ jsonrpc: "2.0", id: item?.id ?? null, error }))
    : { jsonrpc: "2.0", id: req.body?.id ?? null, error };
  res.status(200).json(body);
});

module.exports = {
  app,
};