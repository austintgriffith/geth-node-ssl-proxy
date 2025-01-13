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
    // Generate message ID with appropriate suffix
    const messageId = isCheck ? originalMessageId + '_' : 
                     isCheckB ? originalMessageId + '!' :
                     originalMessageId || generateMessageId(req.body, req.ip || req.connection.remoteAddress);

    console.log(`Sending request to client. isCheck: ${isCheck}, isCheckB: ${isCheckB}, messageId: ${messageId}, originalMessageId: ${originalMessageId}`);

    // Only proceed with check messages if method accepts block number
    if ((isCheck || isCheckB) && !methodsAcceptingBlockNumber.includes(req.body.method)) {
      console.log(`Skipping check for method ${req.body.method} - does not accept block number`);
      return;
    }

    // For check messages, ensure we're using the correct message stores
    if (isCheck || isCheckB) {
      const targetOpenMessages = isCheckB ? openMessagesCheckB : openMessagesCheck;
      const targetRequestStartTimes = isCheckB ? requestStartTimesCheckB : requestStartTimesCheck;

      if (!targetOpenMessages || !targetRequestStartTimes) {
        throw new Error(`${isCheckB ? 'Check B' : 'Check A'} messages require corresponding openMessages and requestStartTimes parameters`);
      }

      targetOpenMessages.set(messageId, { req, timestamp: Date.now(), rpcId: req.body.id });
      targetRequestStartTimes.set(messageId, performance.now());
    } else {
      openMessages.set(messageId, { req, res, timestamp: Date.now(), rpcId: req.body.id });
      requestStartTimes.set(messageId, performance.now());
    }

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