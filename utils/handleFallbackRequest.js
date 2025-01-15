const { generateMessageId } = require('./generateMessageId');
const { logRpcRequest } = require('./logRpcRequest');
const https = require("https");
const axios = require("axios");
const { performance } = require('perf_hooks');
const { fallbackUrl } = require('../config');
const { requestStartTimes, pendingMessageChecks } = require('../globalState');

async function handleFallbackRequest(req, res) {
  console.log("NO CLIENTS CONNECTED, using fallback mechanism");
  try {
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = generateMessageId(req.body, clientIp);
    
    requestStartTimes.set(messageId, performance.now());
    
    const result = await makeFallbackRpcRequest(fallbackUrl, req.body, req.headers);
    
    // Log the RPC request with timing information
    req.handlingClient = null;  // This will make it use the fallback URL in logRpcRequest
    logRpcRequest(req, messageId, true, result);
    
    // Explicitly ensure no check message is created for fallback requests
    if (pendingMessageChecks instanceof Map) {
      pendingMessageChecks.delete(messageId);
    }
    
    res.json(result);
  } catch (error) {
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = generateMessageId(req.body, clientIp);
    
    req.handlingClient = null;
    logRpcRequest(req, messageId, false, null);
    
    // Also ensure no check message in error case
    if (pendingMessageChecks instanceof Map) {
      pendingMessageChecks.delete(messageId);
    }
    
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body.id,
      error: {
        code: -32603,
        message: "Internal error",
        data: error.message
      }
    });
  }
}

async function makeFallbackRpcRequest(url, body, headers) {
  try {
    // Create a new headers object without the problematic host header
    const cleanedHeaders = { ...headers };
    delete cleanedHeaders.host; // Remove the host header to let axios set it correctly

    const response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        ...cleanedHeaders,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: true
      })
    });
    return response.data;
  } catch (error) {
    console.error("RPC request error:", error);
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw error;
  }
}

module.exports = { handleFallbackRequest };