const { generateMessageId } = require('./generateMessageId');
const { performance } = require('perf_hooks');
const {
  openMessages,
  requestStartTimes,
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

    // For check messages, ensure we use the same block number as the main request
    if ((isCheck || isCheckB) && methodsAcceptingBlockNumber.includes(req.body.method)) {
      const mainMessage = openMessages.get(originalMessageId);
      if (mainMessage) {
        const mainParams = mainMessage.req.body.params;
        // If main request specified a block number parameter, use it
        if (mainParams && mainParams.length > 0) {
          const blockParam = mainParams.find(param => typeof param === 'string' && (param.startsWith('0x') || BLOCK_TAGS.includes(param)));
          if (blockParam) {
            // If main request used 'latest', use the largestBlockNumber instead for checks
            if (blockParam === 'latest' && largestBlockNumber) {
              const blockNumberHex = '0x' + largestBlockNumber.toString(16);
              // Find and replace the block number parameter
              const paramIndex = mainParams.indexOf(blockParam);
              if (paramIndex !== -1) {
                req.body.params[paramIndex] = blockNumberHex;
                // Store the actual block number used for this check message
                req.actualBlockNumber = largestBlockNumber;
              }
            } else {
              // Use the exact same block number as main request
              const paramIndex = mainParams.indexOf(blockParam);
              if (paramIndex !== -1) {
                req.body.params[paramIndex] = blockParam;
                // For non-latest params, store the original block number
                req.actualBlockNumber = blockParam;
              }
            }
          }
        }
      }
    }
    
    // Store message in openMessages map
    if (isCheck || isCheckB) {
      openMessages.set(messageId, { 
        req: {
          body: req.body,
          headers: req.headers,
          ip: req.ip,
          hasCheckMessages: req.hasCheckMessages,
          get: req.get?.bind(req),
          actualBlockNumber: req.actualBlockNumber
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
          get: req.get?.bind(req),
          actualBlockNumber: req.actualBlockNumber
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
  } catch (error) {
    console.error('Error sending RPC request:', error);
    throw error;
  }
}

module.exports = { sendRpcRequestToClient };