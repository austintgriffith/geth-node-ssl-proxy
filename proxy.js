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
const cachedMethods = ['eth_chainId', 'eth_blockNumber'];
// const cachedMethods = ['foo'];

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
      try {
        const cacheStartTime = performance.now();
        const cacheResult = await handleCachedRequest(req, res);
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
          logRequest(req, epochTime, utcTimestamp, poolDuration, poolResult.success ? "success" : {
            jsonrpc: "2.0",
            id: req.body.id,
            error: {
              code: -32603,
              message: "Pool request failed",
              data: poolResult.error
            }
          }, 'pool');
          
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
            logRequest(req, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : {
              jsonrpc: "2.0",
              id: req.body.id,
              error: {
                code: -32603,
                message: "Fallback request failed",
                data: fallbackResult.error
              }
            }, 'fallback');
            
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
        logRequest(req, epochTime, utcTimestamp, cacheDuration, {
          jsonrpc: "2.0",
          id: req.body.id,
          error: {
            code: -32603,
            message: "Cache request error",
            data: cacheError.message
          }
        }, 'cache');
        
        // Cache threw an error, try pool
        console.log("🔄 Cache request error, trying pool...", cacheError);
        const poolStartTime = performance.now();
        const poolResult = await handleRequest(req, res, 'pool');
        const poolDuration = (performance.now() - poolStartTime).toFixed(3);
        
        // Log pool attempt - only include full details for errors
        logRequest(req, epochTime, utcTimestamp, poolDuration, poolResult.success ? "success" : {
          jsonrpc: "2.0",
          id: req.body.id,
          error: {
            code: -32603,
            message: "Pool request failed",
            data: poolResult.error
          }
        }, 'pool');
        
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
          logRequest(req, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : {
            jsonrpc: "2.0",
            id: req.body.id,
            error: {
              code: -32603,
              message: "Fallback request failed",
              data: fallbackResult.error
            }
          }, 'fallback');
          
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
      logRequest(req, epochTime, utcTimestamp, poolDuration, poolResult.success ? "success" : {
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
          code: -32603,
          message: "Pool request failed",
          data: poolResult.error
        }
      }, 'pool');
      
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
        logRequest(req, epochTime, utcTimestamp, fallbackDuration, fallbackResult.success ? "success" : {
          jsonrpc: "2.0",
          id: req.body.id,
          error: {
            code: -32603,
            message: "Fallback request failed",
            data: fallbackResult.error
          }
        }, 'fallback');
        
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