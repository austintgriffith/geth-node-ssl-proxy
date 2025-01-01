const { generateMessageId } = require('./generateMessageId');
const { logRpcRequest } = require('./logRpcRequest');
const { makeFallbackRpcRequest } = require('./makeFallbackRpcRequest');
const { performance } = require('perf_hooks');
const { fallbackUrl } = require('../config');

async function handleFallbackRequest(req, res, requestStartTimes) {
  console.log("NO CLIENTS CONNECTED, using fallback mechanism");
  try {
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = generateMessageId(req.body, clientIp);
    
    requestStartTimes.set(messageId, performance.now());
    
    const result = await makeFallbackRpcRequest(fallbackUrl, req.body, req.headers);
    
    // Log the RPC request with timing information
    req.handlingClient = null;  // This will make it use the fallback URL in logRpcRequest
    logRpcRequest(req, messageId, requestStartTimes, true);
    
    res.json(result);
  } catch (error) {
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = generateMessageId(req.body, clientIp);
    
    req.handlingClient = null;
    logRpcRequest(req, messageId, requestStartTimes, false);
    
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

module.exports = { handleFallbackRequest };