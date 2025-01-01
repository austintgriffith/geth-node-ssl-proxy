const { generateMessageId } = require('./generateMessageId');
const { logRpcRequest } = require('./logRpcRequest');
const { performance } = require('perf_hooks');

function handleRpcRequest(req, res, randomClient, openMessages, requestStartTimes, wsMessageTimeout) {
  try {
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = generateMessageId(req.body, clientIp);

    console.log('➕ Adding new open message with id:', messageId);
    openMessages.set(messageId, { req, res, timestamp: Date.now(), rpcId: req.body.id });

    // Store the start time for this messageId
    requestStartTimes.set(messageId, performance.now());

    const modifiedMessage = {
      ...req.body,
      bgMessageId: messageId
    };

    randomClient.ws.send(JSON.stringify(modifiedMessage));

    setTimeout(() => {
      if (openMessages.has(messageId)) {
        console.log('Timeout reached for message:', messageId);
        const { res, rpcId } = openMessages.get(messageId);
        res.status(504).json({
          jsonrpc: "2.0",
          id: rpcId,
          error: {
            code: -32603,
            message: "Gateway Timeout",
            data: "No response received from the node"
          }
        });
        openMessages.delete(messageId);
      }
    }, wsMessageTimeout);

  } catch (error) {
    console.error("Error sending RPC request:", error);
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = generateMessageId(req.body, clientIp);
    
    // Log the failed request
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

module.exports = { handleRpcRequest };