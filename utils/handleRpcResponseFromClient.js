const { getFilteredConnectedClients } = require('./getFilteredConnectedClients');
const { logRpcRequest } = require('./logRpcRequest');
const { incrementRpcRequests } = require('../database_scripts/incrementRpcRequests');
const { getOwnerForClientId } = require('./getOwnerForClientId');
const { incrementOwnerPoints } = require('../database_scripts/incrementOwnerPoints');

async function handleRpcResponseFromClient(parsedMessage, openMessages, connectedClients, client, requestStartTimes) {
  const messageId = parsedMessage.bgMessageId;
  console.log('Received message:', parsedMessage);
  
  if (messageId && openMessages.has(messageId)) {
    console.log(`📲 Found matching open message with id ${messageId}. Sending response.`);
    const openMessage = openMessages.get(messageId);
    const responseWithOriginalId = {
      ...parsedMessage,
      id: openMessage.rpcId
    };
    delete responseWithOriginalId.bgMessageId;
    openMessage.res.json(responseWithOriginalId);
    openMessages.delete(messageId);

    // Add client info to the request object
    const filteredConnectedClients = await getFilteredConnectedClients(connectedClients);
    const handlingClient = Array.from(filteredConnectedClients.values())
      .find(c => c.clientID === client.clientID);
    openMessage.req.handlingClient = handlingClient;

    // Log the RPC request with timing information
    logRpcRequest(openMessage.req, messageId, requestStartTimes, true);

    // Increment n_rpc_requests for the client that served the request
    await incrementRpcRequests(client.clientID);

    // Increment points for the client's owner
    const ownerResult = await getOwnerForClientId(client.clientID);
    if (ownerResult && ownerResult.owner) {
      await incrementOwnerPoints(ownerResult.owner);
    }
  } else {
    console.log(`No open message found for id ${messageId}. This might be a delayed response.`);
  }
}

module.exports = { handleRpcResponseFromClient };