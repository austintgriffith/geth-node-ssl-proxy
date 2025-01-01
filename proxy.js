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
const { performance } = require('perf_hooks');
const { updateRequestOrigin } = require('./database_scripts/updateRequestOrigin');
const { incrementRpcRequests } = require('./database_scripts/incrementRpcRequests');
const { incrementOwnerPoints } = require('./database_scripts/incrementOwnerPoints');
const { logRpcRequest } = require('./utils/logRpcRequest');
const { getOwnerForClientId } = require('./utils/getOwnerForClientId');
const { getFilteredConnectedClients } = require('./utils/getFilteredConnectedClients');
const { checkForFallback } = require('./utils/checkForFallback');
const { makeFallbackRpcRequest } = require('./utils/makeFallbackRpcRequest');
const { validateRpcRequest } = require('./utils/validateRpcRequest');
const { generateMessageId } = require('./utils/generateMessageId');
const { handleWebSocketCheckin } = require('./utils/handleWebSocketCheckin');
const { handleRpcRequest } = require('./utils/handleRpcRequest');
const { handleFallbackRequest } = require('./utils/handleFallbackRequest');
const { cleanupOpenMessages } = require('./utils/cleanupOpenMessages');

const { 
  httpsPort, 
  fallbackUrl, 
  wsHeartbeatInterval,
  wsMessageTimeout,
  messageCleanupInterval 
} = require('./config');

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

EventEmitter.defaultMaxListeners = 20;

const openMessages = new Map();

https.globalAgent.options.ca = require("ssl-root-cas").create(); // For sql connection

app.use(bodyParser.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add this Map to store start times for each bgMessageId
const requestStartTimes = new Map();

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

  const filteredConnectedClients = await getFilteredConnectedClients(connectedClients);

  if(filteredConnectedClients.size > 0) {
    const clientsArray = Array.from(filteredConnectedClients.values());
    const randomClient = clientsArray[Math.floor(Math.random() * clientsArray.length)];
    
    if (randomClient && randomClient.ws) {
      handleRpcRequest(req, res, randomClient, openMessages, requestStartTimes, wsMessageTimeout);
    } else {
      console.log("Selected client is invalid or has no WebSocket connection");
      const clientIp = req.ip || req.connection.remoteAddress;
      const messageId = generateMessageId(req.body, clientIp);
      
      logRpcRequest(req, messageId, requestStartTimes, false);
      
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
          code: -32603,
          message: "Internal error",
          data: "No valid client available"
        }
      });
    }
  } else {
    await handleFallbackRequest(req, res, requestStartTimes);
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

const connectedClients = new Set();

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
      } else {
        console.log('Received message with unknown type:', parsedMessage);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
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

// Start the HTTPS server (which now includes WebSocket)
server.listen(httpsPort, () => {
  console.log(`HTTPS and WebSocket server listening on port ${httpsPort}...`);
});

setInterval(checkForFallback, 5000);
checkForFallback();

setInterval(() => cleanupOpenMessages(openMessages, messageCleanupInterval), messageCleanupInterval);

module.exports = {
  app,
  connectedClients,
  openMessages,
  requestStartTimes
};