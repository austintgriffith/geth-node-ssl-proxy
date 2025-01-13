const { getFilteredConnectedClients } = require('./getFilteredConnectedClients');
const { logRpcRequest } = require('./logRpcRequest');
const { incrementRpcRequests } = require('../database_scripts/incrementRpcRequests');
const { getOwnerForClientId } = require('./getOwnerForClientId');
const { incrementOwnerPoints } = require('../database_scripts/incrementOwnerPoints');

async function handleRpcResponseFromClient(parsedMessage, openMessages, connectedClients, client, requestStartTimes, openMessagesCheck = null, requestStartTimesCheck = null, openMessagesCheckB = null, requestStartTimesCheckB = null, pendingMessageChecks = null) {
  const messageId = parsedMessage.bgMessageId;
  console.log('Received message:', parsedMessage);
  
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
      const [filteredConnectedClients, largestBlockNumber] = await getFilteredConnectedClients(connectedClients);
      const handlingClient = Array.from(filteredConnectedClients.values())
        .find(c => c.clientID === client.clientID);
      openMessage.req.handlingClient = handlingClient;

      // Log the RPC request with timing information
      logRpcRequest(openMessage.req, messageId, requestStartTimes, true, parsedMessage.result, pendingMessageChecks);

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
    const [filteredConnectedClients, largestBlockNumber] = await getFilteredConnectedClients(connectedClients);
    const handlingClient = Array.from(filteredConnectedClients.values())
      .find(c => c.clientID === client.clientID);
    openMessage.req.handlingClient = handlingClient;
    
    logRpcRequest(openMessage.req, messageId, requestStartTimesCheck || requestStartTimes, true, parsedMessage.result, pendingMessageChecks);
    openMessagesCheck.delete(messageId);
  } else if (messageId && openMessagesCheckB && openMessagesCheckB.has(messageId)) {
    console.log(`Logging response for check message B with id ${messageId}`);
    const openMessage = openMessagesCheckB.get(messageId);
    
    const [filteredConnectedClients, largestBlockNumber] = await getFilteredConnectedClients(connectedClients);
    const handlingClient = Array.from(filteredConnectedClients.values())
      .find(c => c.clientID === client.clientID);
    openMessage.req.handlingClient = handlingClient;
    
    // Strip any existing suffix before adding '!'
    const baseMessageId = messageId.endsWith('_') ? messageId.slice(0, -1) : messageId;
    
    // Add debug log to see the messageId being passed
    console.log('Check B message ID before logging:', baseMessageId + '!');
    
    logRpcRequest(openMessage.req, baseMessageId + '!', requestStartTimesCheckB || requestStartTimes, true, parsedMessage.result, pendingMessageChecks);
    openMessagesCheckB.delete(messageId);
  } else {
    console.log(`No open message found for id ${messageId}. This might be a delayed response.`);
  }
}

module.exports = { handleRpcResponseFromClient };