const https = require("https");
const express = require("express");
const axios = require("axios");
const fs = require("fs");
var cors = require("cors");
var bodyParser = require("body-parser");
const app = express();
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const { updateRequestOrigin } = require('./database_scripts/updateRequestOrigin');
const { getFilteredConnectedClients } = require('./utils/getFilteredConnectedClients');
const { checkForFallback } = require('./utils/checkForFallback');
const { validateRpcRequest } = require('./utils/validateRpcRequest');
const { generateMessageId } = require('./utils/generateMessageId');
const { handleWebSocketCheckin } = require('./utils/handleWebSocketCheckin');
const { sendRpcRequestToClient } = require('./utils/sendRpcRequestToClient');
const { handleFallbackRequest } = require('./utils/handleFallbackRequest');
const { cleanupOpenMessages } = require('./utils/cleanupOpenMessages');
const { handleRpcResponseFromClient } = require('./utils/handleRpcResponseFromClient');
const { processMessageChecks } = require('./utils/processMessageChecks');

const { 
  httpsPort, 
  fallbackUrl, 
  wsHeartbeatInterval,
  wsMessageTimeout,
  messageCleanupInterval 
} = require('./config');

const { 
  openMessages,
  requestStartTimes,
  openMessagesCheck,
  requestStartTimesCheck,
  openMessagesCheckB,
  requestStartTimesCheckB,
  pendingMessageChecks
} = require('./globalState');

const nodeContinentsRouter = require('./routes/nodecontinents');
const requestOriginsRouter = require('./routes/requestorigins');
const iplocationsRouter = require('./routes/iplocations');
const peeridsRouter = require('./routes/peerids');
const consensuspeeraddrRouter = require('./routes/consensuspeeraddr');
const enodesRouter = require('./routes/enodes');
const pointsRouter = require('./routes/points');
const proxyurlRouter = require('./routes/proxyurl');
const activeRouter = require('./routes/active');
const yourpointsRouter = require('./routes/yourpoints');
const methodsRouter = require('./routes/methods');
const methodsByRefererRouter = require('./routes/methodsbyreferer');
const letathousandscaffoldethsbloomRouter = require('./routes/letathousandscaffoldethsbloom');
const blockRouter = require('./routes/block');
const syncRouter = require('./routes/sync');
const checkinRouter = require('./routes/checkin');
const dashboardRouter = require('./routes/dashboard');
const listPendingMessageChecksRouter = require('./routes/listpendingmessagechecks');

app.use(nodeContinentsRouter);
app.use(requestOriginsRouter);
app.use(iplocationsRouter);
app.use(peeridsRouter);
app.use(consensuspeeraddrRouter);
app.use(enodesRouter);
app.use(pointsRouter);
app.use(proxyurlRouter);
app.use(activeRouter);
app.use(yourpointsRouter);
app.use(methodsRouter);
app.use(methodsByRefererRouter);
app.use(letathousandscaffoldethsbloomRouter);
app.use(blockRouter);
app.use(syncRouter);
app.use(checkinRouter);
app.use(dashboardRouter);
app.use(listPendingMessageChecksRouter);

EventEmitter.defaultMaxListeners = 20;

const connectedClients = new Set();

https.globalAgent.options.ca = require("ssl-root-cas").create(); // For sql connection

app.use(bodyParser.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Create the HTTPS server
const server = https.createServer(
  {
    key: fs.readFileSync("server.key"),
    cert: fs.readFileSync("server.cert"),
  },
  app
);

// Create a WebSocket server attached to the HTTPS server
const wss = new WebSocket.Server({ server });

// Start the HTTPS server (which now includes WebSocket)
server.listen(httpsPort, () => {
  console.log("----------------------------------------------------------------------------------------------------------------");
  console.log("----------------------------------------------------------------------------------------------------------------");
  console.log(`HTTPS and WebSocket server listening on port ${httpsPort}...`);
});

function getRandomClients(clientsArray) {
  if (clientsArray.length < 3) {
    return [clientsArray[0], null, null];
  }
  
  // Create a copy of the array to avoid modifying the original
  const available = [...clientsArray];
  
  // Get first random client
  const randomIndex1 = Math.floor(Math.random() * available.length);
  const client1 = available[randomIndex1];
  available.splice(randomIndex1, 1);
  
  // Get second random client
  const randomIndex2 = Math.floor(Math.random() * available.length);
  const client2 = available[randomIndex2];
  available.splice(randomIndex2, 1);
  
  // Get third random client
  const randomIndex3 = Math.floor(Math.random() * available.length);
  const client3 = available[randomIndex3];
  
  return [client1, client2, client3];
}

app.post("/", validateRpcRequest, async (req, res) => {
  console.log("--------------------------------------------------------");
  console.log("📡 RPC REQUEST", req.body);
  
  // Extract the origin from the Referer or Origin header
  let reqHost = req.get('Referer') || req.get('Origin') || req.get('host');
  
  // Parse the URL to extract just the hostname
  try {
    const url = new URL(reqHost);
    reqHost = url.hostname;
  } catch (error) {
    // If parsing fails, fall back to the original host
    reqHost = req.get('host').split(':')[0];
  }

  console.log("🌐 Request Origin:", reqHost);

  await updateRequestOrigin(reqHost);

  try {
    const [filteredConnectedClients, largestBlockNumber] = await getFilteredConnectedClients(connectedClients);
    
    if(filteredConnectedClients.size > 0) {
      const clientsArray = Array.from(filteredConnectedClients.values());
      req.totalConnectedClients = clientsArray.length;
      
      // Set hasCheckMessages flag BEFORE sending any requests
      req.hasCheckMessages = clientsArray.length >= 3;
      
      // Get random clients for main and check requests
      const [randomClient, randomClientCheck, randomClientCheckB] = getRandomClients(clientsArray);

      if (randomClient && randomClient.ws) {
        const originalMessageId = generateMessageId(req.body, req.ip || req.connection.remoteAddress);
        
        // Only send the main request if we have enough clients for checks
        if (!randomClientCheck || !randomClientCheckB) {
          // Not enough clients for checks, just send main request
          req.hasCheckMessages = false;
          sendRpcRequestToClient(req, res, randomClient, wsMessageTimeout, false, originalMessageId);
        } else {
          // We have enough clients, send all requests
          req.hasCheckMessages = true;
          
          // Send check requests first
          console.log('Sending check request (_):', {
            messageId: originalMessageId + '_',
            client: randomClientCheck.clientID,
            isCheck: true
          });
          sendRpcRequestToClient(req, res, randomClientCheck, wsMessageTimeout, true, originalMessageId, largestBlockNumber);

          console.log('Sending check request (!):', {
            messageId: originalMessageId + '!',
            client: randomClientCheckB.clientID,
            isCheck: false
          });
          sendRpcRequestToClient(
            req, res, randomClientCheckB, wsMessageTimeout, false,
            originalMessageId, largestBlockNumber, true
          );

          // Now send the main request
          sendRpcRequestToClient(req, res, randomClient, wsMessageTimeout, false, originalMessageId);
        }
      } else {
        handleFallbackRequest(req, res);
      }
    } else {
      handleFallbackRequest(req, res);
    }
  } catch (error) {
    console.error('Error processing request:', error);
    handleFallbackRequest(req, res);
  }

  console.log("POST SERVED", req.body);
});

app.get("/", (req, res) => {
  console.log("GET", req.headers.referer);
  axios
    .get(fallbackUrl, {
      httpsAgent: new https.Agent({
        rejectUnauthorized: true,
      }),
      headers: {
        ...req.headers,
      },
    })
    .then((response) => {
      console.log("GET RESPONSE", response.data);
      res.status(response.status).send(response.data);
    })
    .catch((error) => {
      console.log("GET ERROR", error.message);
      res
        .status(error.response ? error.response.status : 500)
        .send(error.message);
    });

  console.log("GET REQUEST SERVED");
});

// Modify the WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  const clientID = uuidv4();
  console.log(`Client ID: ${clientID}`);

  const client = {ws, clientID};
  connectedClients.add(client);
  ws.send(JSON.stringify({id: clientID}));

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('ping', () => {
    ws.pong();
  });

  // Set up the persistent message listener
  ws.on('message', async (message) => {
    try {
      const parsedMessage = JSON.parse(message);

      if (parsedMessage.type === 'checkin') {
        handleWebSocketCheckin(ws, JSON.stringify(parsedMessage.params));
        // console.log('Received checkin message');
      } else if (parsedMessage.jsonrpc === '2.0') {
        await handleRpcResponseFromClient(parsedMessage, connectedClients, client);
      } else {
        console.log('Received message with unknown type:', parsedMessage);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected:', client.clientID);
    
    // Clean up any pending messages from this client
    for (const [messageId, message] of openMessages) {
      if (message.req.handlingClient?.clientID === client.clientID) {
        console.log(`Cleaning up pending message ${messageId} for disconnected client ${client.clientID}`);
        openMessages.delete(messageId);
      }
    }
    
    // Also clean up check messages
    for (const [messageId, message] of openMessagesCheck) {
      if (message.req.handlingClient?.clientID === client.clientID) {
        openMessagesCheck.delete(messageId);
      }
    }
    
    for (const [messageId, message] of openMessagesCheckB) {
      if (message.req.handlingClient?.clientID === client.clientID) {
        openMessagesCheckB.delete(messageId);
      }
    }
    
    connectedClients.delete(client);
  });
});

// Set up an interval to check for dead connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating inactive WebSocket connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, wsHeartbeatInterval);

wss.on('close', () => {
  clearInterval(interval);
});

setInterval(checkForFallback, 5000);
checkForFallback();

setInterval(() => cleanupOpenMessages(messageCleanupInterval), messageCleanupInterval);

// Process message checks every 20 seconds
setInterval(processMessageChecks, 20000);

// Set up an interval to check for pending message checks, compare results, and log results

module.exports = {
  app,
  connectedClients
};