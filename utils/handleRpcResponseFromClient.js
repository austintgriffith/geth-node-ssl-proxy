const { getFilteredConnectedClients } = require('./getFilteredConnectedClients');
const { logRpcRequest } = require('./logRpcRequest');
const { incrementRpcRequests } = require('../database_scripts/incrementRpcRequests');
const { getOwnerForClientId } = require('./getOwnerForClientId');
const { incrementOwnerPoints } = require('../database_scripts/incrementOwnerPoints');
const { openMessages } = require('../globalState');
const { getDbPool } = require('./dbUtils');

// Define special block tags
const BLOCK_TAGS = ['latest', 'pending', 'earliest'];

// List of methods that accept block number parameters
const methodsAcceptingBlockNumber = [
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_getStorageAt',
  'eth_call',
  'eth_getBlockByNumber',
  'eth_getBlockTransactionCountByNumber',
  'eth_getUncleCountByBlockNumber',
  'eth_getProof'
];

// Helper function to safely parse hex or decimal block numbers
function parseBlockNumber(value) {
  try {
    if (typeof value === 'string') {
      if (value.startsWith('0x')) {
        // For hex strings, convert directly to decimal using BigInt to handle large numbers
        return BigInt(value).toString();
      }
      // For non-hex strings, try parsing as regular number
      if (!isNaN(value)) {
        return value.toString();
      }
    } else if (typeof value === 'number') {
      return value.toString();
    }
    
    console.error('Invalid block number format:', value);
    return null;
  } catch (error) {
    console.error('Error parsing block number:', error, 'Value:', value);
    return null;
  }
}

async function handleRpcResponseFromClient(parsedMessage, connectedClients, client) {
  const messageId = parsedMessage.bgMessageId;
  console.log('Received message:', messageId);
  
  try {
    // Get client info first
    let targetBlockNumber = null;
    let originalBlockParam = null;
    
    // For check messages, get the target block number from the original request
    if (messageId && (messageId.endsWith('_') || messageId.endsWith('!'))) {
      const originalMessageId = messageId.slice(0, -1);
      if (openMessages.has(originalMessageId)) {
        const mainMessage = openMessages.get(originalMessageId);
        const params = mainMessage.req.body.params;
        if (params && params.length > 0 && methodsAcceptingBlockNumber.includes(mainMessage.req.body.method)) {
          // Ensure the last parameter is the block number
          originalBlockParam = params[params.length - 1];

          // Validate and parse the block number parameter
          if (typeof originalBlockParam === 'string' &&
              (/^0x[0-9a-fA-F]+$/.test(originalBlockParam) || BLOCK_TAGS.includes(originalBlockParam))) {
            if (originalBlockParam === 'latest') {
              // For 'latest', use the client's current block number
              const pool = await getDbPool();
              try {
                const result = await pool.query(
                  'SELECT block_number FROM node_status WHERE socket_id = $1',
                  [client.clientID]
                );
                if (result.rows.length > 0) {
                  targetBlockNumber = result.rows[0].block_number.toString();
                  console.log(`Using client's current block number ${targetBlockNumber} for check message ${messageId}`);
                }
              } catch (error) {
                console.error('Error getting client block number:', error);
              }
            } else {
              targetBlockNumber = parseBlockNumber(originalBlockParam);
              console.log(`Parsed block parameter ${originalBlockParam} (${typeof originalBlockParam}) to ${targetBlockNumber}`);
            }
          } else if (typeof originalBlockParam === 'number' && Number.isInteger(originalBlockParam) && originalBlockParam >= 0) {
            targetBlockNumber = originalBlockParam.toString();
            console.log(`Parsed block parameter ${originalBlockParam} (number) to ${targetBlockNumber}`);
          } else {
            console.log(`No valid block number found in parameters for message ${messageId}`);
          }
        }
      }
    }

    if (targetBlockNumber === null) {
      console.log(`No valid block number found for message ${messageId}, original param:`, originalBlockParam);
    }

    const [filteredConnectedClients, largestBlockNumber] = await getFilteredConnectedClients(
      connectedClients,
      // Only pass targetBlockNumber for check messages
      messageId && (messageId.endsWith('_') || messageId.endsWith('!')) ? targetBlockNumber : null
    );
    const handlingClient = Array.from(filteredConnectedClients.values())
      .find(c => c.clientID === client.clientID);

    if (!handlingClient) {
      // Get the client's current block number from the database
      const pool = await getDbPool();
      let clientBlockNumber = 'unknown';
      try {
        const result = await pool.query(
          'SELECT block_number FROM node_status WHERE socket_id = $1',
          [client.clientID]
        );
        if (result.rows.length > 0) {
          clientBlockNumber = result.rows[0].block_number.toString();
        }
      } catch (error) {
        console.error('Error getting client block number:', error);
      }

      // Only include target block info in error message for check messages
      const errorMessage = (messageId.endsWith('_') || messageId.endsWith('!')) ?
        `Client ${client.clientID} (at block ${clientBlockNumber}) no longer connected or not at required block height (target: ${targetBlockNumber}, original param: ${originalBlockParam}) - discarding response for message ${messageId}` :
        `Client ${client.clientID} (at block ${clientBlockNumber}) no longer connected - discarding response for message ${messageId}`;
      
      console.error(errorMessage);
      
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
  } catch (error) {
    console.error('Error processing message:', error);
    // Clean up any pending messages for this client in case of error
    if (messageId && openMessages.has(messageId)) {
      const message = openMessages.get(messageId);
      if (message.res) {
        message.res.status(500).json({
          jsonrpc: "2.0",
          id: message.rpcId,
          error: {
            code: -32603,
            message: "Internal error",
            data: error.message
          }
        });
      }
      openMessages.delete(messageId);
    }
  }
}

module.exports = { handleRpcResponseFromClient };