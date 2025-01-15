const { getFilteredConnectedClients } = require('./getFilteredConnectedClients');
const { logRpcRequest } = require('./logRpcRequest');
const { incrementRpcRequests } = require('../database_scripts/incrementRpcRequests');
const { getOwnerForClientId } = require('./getOwnerForClientId');
const { incrementOwnerPoints } = require('../database_scripts/incrementOwnerPoints');
const {
  openMessages,
  requestStartTimes,
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
      if (message.res) { // Only send response for main messages
        message.res.status(502).json({
          jsonrpc: "2.0",
          id: message.rpcId,
          error: {
            code: -32603,
            message: "Bad Gateway",
            data: "Client disconnected while processing request"
          }
        });
      }
      openMessages.delete(messageId);
    }
    return;
  }

  if (messageId && openMessages.has(messageId)) {
    console.log(`📲 Found matching open message with id ${messageId}`);
    const openMessage = openMessages.get(messageId);

    // Add client info to the request object
    openMessage.req.handlingClient = handlingClient;

    // Only send JSON response for main messages (no suffix)
    const isMainMessage = !messageId.endsWith('_') && !messageId.endsWith('!');
    if (isMainMessage && openMessage.res) {
      console.log('Sending response for main message');
      const responseWithOriginalId = {
        ...parsedMessage,
        id: openMessage.rpcId
      };
      delete responseWithOriginalId.bgMessageId;
      openMessage.res.json(responseWithOriginalId);
    }

    // Log the RPC request with timing information
    logRpcRequest(openMessage.req, messageId, true, parsedMessage.result);

    // For main messages, increment stats
    if (isMainMessage) {
      // Increment n_rpc_requests for the client that served the request
      await incrementRpcRequests(client.clientID);

      // Increment points for the client's owner
      const ownerResult = await getOwnerForClientId(client.clientID);
      if (ownerResult && ownerResult.owner) {
        await incrementOwnerPoints(ownerResult.owner);
      }
    }

    openMessages.delete(messageId);
  } else {
    console.log(`No open message found for id ${messageId}. This might be a delayed response.`);
  }
}

module.exports = { handleRpcResponseFromClient };