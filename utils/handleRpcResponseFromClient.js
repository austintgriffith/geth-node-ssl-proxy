const { getFilteredConnectedClients } = require('./getFilteredConnectedClients');
const { logRpcRequest } = require('./logRpcRequest');
const { incrementRpcRequests } = require('../database_scripts/incrementRpcRequests');
const { getOwnerForClientId } = require('./getOwnerForClientId');
const { incrementOwnerPoints } = require('../database_scripts/incrementOwnerPoints');
const {
  openMessages,
  requestStartTimes,
  openMessagesCheck,
  requestStartTimesCheck,
  openMessagesCheckB,
  requestStartTimesCheckB,
  pendingMessageChecks
} = require('../globalState');

async function handleRpcResponseFromClient(parsedMessage, connectedClients, client) {
  const messageId = parsedMessage.bgMessageId;
  console.log('Received message:', messageId);
  
  // Get client info first
  const [filteredConnectedClients, largestBlockNumber] = await getFilteredConnectedClients(connectedClients);
  const handlingClient = Array.from(filteredConnectedClients.values())
    .find(c => c.clientID === client.clientID);

  if (!handlingClient) {
    console.error(`Client ${client.clientID} no longer connected - discarding response for message ${messageId}`);
    
    // Clean up any pending messages for this client
    if (openMessages.has(messageId)) {
      const message = openMessages.get(messageId);
      message.res?.status(502).json({
        jsonrpc: "2.0",
        id: message.rpcId,
        error: {
          code: -32603,
          message: "Bad Gateway",
          data: "Client disconnected while processing request"
        }
      });
      openMessages.delete(messageId);
    }
    
    // Also clean up from check message maps
    openMessagesCheck?.delete(messageId);
    openMessagesCheckB?.delete(messageId);
    return;
  }

  // Add debug logging for check B messages
  if (openMessagesCheckB && openMessagesCheckB.has(messageId)) {
    console.log('Found check B message in openMessagesCheckB:', messageId);
  }

  if (messageId && openMessages.has(messageId)) {
    console.log(`📲 Found matching open message with id ${messageId}. Sending response.`);
    const openMessage = openMessages.get(messageId);

    // Ensure the message is still open before sending a response
    if (openMessages.has(messageId)) {
      const responseWithOriginalId = {
        ...parsedMessage,
        id: openMessage.rpcId
      };
      delete responseWithOriginalId.bgMessageId;
      openMessage.res.json(responseWithOriginalId);
      openMessages.delete(messageId);

      // Add client info to the request object
      openMessage.req.handlingClient = handlingClient;

      // Log the RPC request with timing information
      logRpcRequest(openMessage.req, messageId, true, parsedMessage.result);

      // Increment n_rpc_requests for the client that served the request
      await incrementRpcRequests(client.clientID);

      // Increment points for the client's owner
      const ownerResult = await getOwnerForClientId(client.clientID);
      if (ownerResult && ownerResult.owner) {
        await incrementOwnerPoints(ownerResult.owner);
      }
    }
  } else if (messageId && openMessagesCheck && openMessagesCheck.has(messageId)) {
    console.log(`Logging response for check message with id ${messageId}.`);
    const openMessage = openMessagesCheck.get(messageId);
    
    // Add client info to the request object for check messages
    openMessage.req.handlingClient = handlingClient;
    
    logRpcRequest(openMessage.req, messageId, true, parsedMessage.result);
    openMessagesCheck.delete(messageId);
  } else if (messageId && openMessagesCheckB && openMessagesCheckB.has(messageId)) {
    console.log(`Logging response for check message B with id ${messageId}`);
    const openMessage = openMessagesCheckB.get(messageId);
    
    openMessage.req.handlingClient = handlingClient;
    
    // Important: Don't modify the messageId, use it as is
    console.log('Check B message ID before logging:', messageId);
    
    logRpcRequest(openMessage.req, messageId, true, parsedMessage.result);
    openMessagesCheckB.delete(messageId);
  } else {
    console.log(`No open message found for id ${messageId}. This might be a delayed response.`);
  }
}

module.exports = { handleRpcResponseFromClient };