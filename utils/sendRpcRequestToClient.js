const { generateMessageId } = require('./generateMessageId');
const { logRpcRequest } = require('./logRpcRequest');
const { performance } = require('perf_hooks');

function sendRpcRequestToClient(req, res, randomClient, openMessages, requestStartTimes, wsMessageTimeout, isCheck = false, openMessagesCheck = null, requestStartTimesCheck = null, originalMessageId = null) {
  try {
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = isCheck ? originalMessageId + '_' : generateMessageId(req.body, clientIp);

    if (!isCheck) {
      console.log('➕ Adding new open message with id:', messageId);
      openMessages.set(messageId, { req, res, timestamp: Date.now(), rpcId: req.body.id });
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
    } else {
      if (!openMessagesCheck || !requestStartTimesCheck) {
        throw new Error('Check messages require openMessagesCheck and requestStartTimesCheck parameters');
      }
      // For check messages, don't include the res object
      openMessagesCheck.set(messageId, { req, timestamp: Date.now(), rpcId: req.body.id });
      requestStartTimesCheck.set(messageId, performance.now());

      const checkModifiedMessage = {
        ...req.body,
        bgMessageId: messageId
      };

      randomClient.ws.send(JSON.stringify(checkModifiedMessage));
    }
  } catch (error) {
    console.error("Error sending RPC request:", error);
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = generateMessageId(req.body, clientIp);
    
    // Log the failed request
    logRpcRequest(req, messageId, requestStartTimes, false);
    
    if (!isCheck) {
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
}

module.exports = { sendRpcRequestToClient };