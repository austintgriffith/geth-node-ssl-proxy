const { generateMessageId } = require('./generateMessageId');
const { logRpcRequest } = require('./logRpcRequest');
const { performance } = require('perf_hooks');

const methodsAcceptingBlockNumber = [
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_getStorageAt',
  'eth_call',
  'eth_getBlockByNumber',
  'eth_getBlockTransactionCountByNumber',
  'eth_getUncleCountByBlockNumber',
  // 'eth_getUncleByBlockNumberAndIndex',
  // 'eth_getTransactionByBlockNumberAndIndex',
  'eth_getProof'
];

const BLOCK_TAGS = ['latest', 'pending', 'earliest'];

function sendRpcRequestToClient(req, res, randomClient, openMessages, requestStartTimes, wsMessageTimeout, isCheck = false, openMessagesCheck = null, requestStartTimesCheck = null, originalMessageId = null, pendingMessageChecks = null, largestBlockNumber = null, isCheckB = false, openMessagesCheckB = null, requestStartTimesCheckB = null) {
  try {
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = isCheck ? originalMessageId + '_' : 
                     isCheckB ? originalMessageId + '!' :
                     generateMessageId(req.body, clientIp);

    console.log(`Sending request to client. isCheck: ${isCheck}, isCheckB: ${isCheckB}, messageId: ${messageId}`);

    // Only proceed with check messages if method accepts block number
    if ((isCheck || isCheckB) && !methodsAcceptingBlockNumber.includes(req.body.method)) {
      console.log(`Skipping check for method ${req.body.method} - does not accept block number`);
      return;
    }

    if (!isCheck && !isCheckB) {
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
      const targetOpenMessages = isCheck ? openMessagesCheck : openMessagesCheckB;
      const targetRequestStartTimes = isCheck ? requestStartTimesCheck : requestStartTimesCheckB;

      if (!targetOpenMessages || !targetRequestStartTimes) {
        throw new Error('Check messages require corresponding openMessages and requestStartTimes parameters');
      }

      targetOpenMessages.set(messageId, { req, timestamp: Date.now(), rpcId: req.body.id });
      targetRequestStartTimes.set(messageId, performance.now());

      // Convert largestBlockNumber to hex and ensure it has '0x' prefix
      const blockNumberHex = largestBlockNumber ? '0x' + largestBlockNumber.toString(16) : null;

      // Create modified message with params array
      const checkModifiedMessage = {
        ...req.body,
        bgMessageId: messageId
      };
      
      // Handle different parameter structures for block number
      if (req.body.params && req.body.params.length > 0) {
        const firstParam = req.body.params[0];
        if (typeof firstParam === 'object' && firstParam !== null) {
          // If first param is an object, only add blockNumber if it doesn't exist
          if (!firstParam.hasOwnProperty('blockNumber')) {
            checkModifiedMessage.params = [
              { ...firstParam, blockNumber: blockNumberHex },
              ...req.body.params.slice(1)
            ];
          }
        } else {
          // For array params, check if last param is a block tag or number
          const lastParam = req.body.params[req.body.params.length - 1];
          if (typeof lastParam === 'string' && 
              (lastParam.startsWith('0x') || BLOCK_TAGS.includes(lastParam))) {
            // Keep existing block parameter
            checkModifiedMessage.params = [...req.body.params];
          } else {
            // Add block number if no block parameter exists
            checkModifiedMessage.params = [...req.body.params, blockNumberHex];
          }
        }
      } else {
        // No parameters provided, add block number
        checkModifiedMessage.params = [blockNumberHex];
      }
      
      console.log(`Sending check message to client: ${messageId}`);
      randomClient.ws.send(JSON.stringify(checkModifiedMessage));
    }
  } catch (error) {
    console.error("Error sending RPC request:", error);
    const clientIp = req.ip || req.connection.remoteAddress;
    const messageId = generateMessageId(req.body, clientIp);
    
    // Log the failed request
    logRpcRequest(req, messageId, requestStartTimes, false, null, pendingMessageChecks);
    
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