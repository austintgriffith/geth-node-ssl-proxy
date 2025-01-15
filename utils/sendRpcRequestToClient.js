const { generateMessageId } = require('./generateMessageId');
const { logRpcRequest } = require('./logRpcRequest');
const { performance } = require('perf_hooks');
const {
  openMessages,
  requestStartTimes,
  pendingMessageChecks
} = require('../globalState');

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

function sendRpcRequestToClient(
  req, 
  res, 
  randomClient, 
  wsMessageTimeout, 
  isCheck = false, 
  originalMessageId = null, 
  largestBlockNumber = null, 
  isCheckB = false
) {
  try {
    // Generate message ID with appropriate suffix
    const messageId = isCheck ? originalMessageId + '_' : 
                     isCheckB ? originalMessageId + '!' :
                     originalMessageId || generateMessageId(req.body, req.ip || req.connection.remoteAddress);

    console.log(`Sending request to client. isCheck: ${isCheck}, isCheckB: ${isCheckB}, messageId: ${messageId}, originalMessageId: ${originalMessageId}`);

    // If this is a check message and method doesn't accept block number, notify the main request
    if ((isCheck || isCheckB) && !methodsAcceptingBlockNumber.includes(req.body.method)) {
      console.log(`Skipping check for method ${req.body.method} - does not accept block number`);
      // Find the main message and update its hasCheckMessages flag
      const mainMessage = openMessages.get(originalMessageId);
      if (mainMessage) {
        mainMessage.req.hasCheckMessages = false;
      }
      return;
    }

    // For main messages, only set hasCheckMessages if method accepts block number
    if (!methodsAcceptingBlockNumber.includes(req.body.method)) {
      req.hasCheckMessages = false;
    }
    
    // Store message in openMessages map
    if (isCheck || isCheckB) {
      openMessages.set(messageId, { 
        req: {
          body: req.body,
          headers: req.headers,
          ip: req.ip,
          hasCheckMessages: req.hasCheckMessages,
          get: req.get?.bind(req)
        }, 
        timestamp: Date.now(), 
        rpcId: req.body.id 
      });
    } else {
      openMessages.set(messageId, { 
        req: {
          body: req.body,
          headers: req.headers,
          ip: req.ip,
          hasCheckMessages: req.hasCheckMessages,
          get: req.get?.bind(req)
        }, 
        res, 
        timestamp: Date.now(), 
        rpcId: req.body.id 
      });
    }
    requestStartTimes.set(messageId, performance.now());

    const modifiedMessage = {
      ...req.body,
      bgMessageId: messageId
    };

    randomClient.ws.send(JSON.stringify(modifiedMessage));

    setTimeout(() => {
      if (openMessages.has(messageId)) {
        console.log('Timeout reached for message:', messageId);
        const message = openMessages.get(messageId);
        
        // Only send error response if we have a res object (main request)
        if (message.res) {
          message.res.status(504).json({
            jsonrpc: "2.0",
            id: message.rpcId,
            error: {
              code: -32603,
              message: "Gateway Timeout",
              data: "No response received from the node"
            }
          });
        }
        openMessages.delete(messageId);
      }
    }, wsMessageTimeout);

    // // Add flag to indicate if this request has check messages
    // if (!isCheck && !isCheckB) {
    //   req.hasCheckMessages = req.totalConnectedClients >= 3;
    // }
  } catch (error) {
    console.error('Error sending RPC request:', error);
    throw error;
  }
}

module.exports = { sendRpcRequestToClient };