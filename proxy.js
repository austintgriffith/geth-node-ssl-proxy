const https = require("https");
var httpProxy = require("http-proxy");
const express = require("express");
const axios = require("axios");
const fs = require("fs");
var cors = require("cors");
var bodyParser = require("body-parser");
const app = express();
const publicClient = require('./utils/publicClient');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { getDbPool } = require('./utils/dbUtils');
const { getIpLocation } = require('./utils/getIpLocation');

const { 
  httpsPort, 
  targetUrl, 
  localProviderUrl,
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

EventEmitter.defaultMaxListeners = 20; // Increase the default max listeners

const openMessages = new Map();

https.globalAgent.options.ca = require("ssl-root-cas").create();
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

app.use(bodyParser.json());
app.use(cors());
//app.use(express.json())
//app.use(express.bodyParser());
//app.use(bodyParser.json());

// var proxy = httpProxy.createProxyServer();

// var last = "";

require('./routes/nodecontinents');

// let fallbackUrl = "";

const checkForFallback = async () => {
  // console.log("Checking for fallback URL...");

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const minutes = 5; // Set to 5 minutes
      const result = await client.query(`
        SELECT id, block_number
        FROM node_status
        WHERE last_checkin > NOW() - INTERVAL '${minutes} minutes'
        ORDER BY block_number DESC
      `);

      // console.log(`Active nodes in the last ${minutes} minutes:`);
      // result.rows.forEach(row => {
      //   console.log(`ID: ${row.id}, Block Number: ${row.block_number}`);
      // });

    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error checking for fallback:', err);
  }
}

async function getFilteredConnectedClients() {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const minutes = 5; // Default to 5 minutes
      const result = await client.query(`
        SELECT id, block_number, last_checkin, socket_id
        FROM node_status
        WHERE last_checkin > NOW() - INTERVAL '${minutes} minutes'
        ORDER BY block_number DESC
      `);
      
      // Find the largest block number
      const largestBlockNumber = result.rows.reduce((max, row) => 
        row.block_number > max ? row.block_number : max, 0);

      console.log("LARGEST BLOCK NUMBER", largestBlockNumber.toString());

      // Filter rows with the largest block number
      const filteredRows = result.rows.filter(row => row.block_number === largestBlockNumber);

      // console.log("FILTERED ROWS", filteredRows);
      
      // Log connected clients in more detail
      // console.log("CONNECTED CLIENTS:", Array.from(connectedClients).map(client => ({
      //   clientID: client.clientID,
      //   ws: client.ws ? 'WebSocket Present' : 'No WebSocket'
      // })));

      // Create a Map of filtered clients
      const filteredClients = new Map();
      filteredRows.forEach(row => {
        //console.log(`Checking row with socket_id: ${row.socket_id}`);
        if (row.socket_id) {
          const matchingClient = Array.from(connectedClients).find(client => {
            //console.log(`Comparing: ${client.clientID} with ${row.socket_id}`);
            return client.clientID === row.socket_id;
          });
          if (matchingClient) {
            //console.log(`Found matching client for socket_id: ${row.socket_id}`);
            filteredClients.set(row.socket_id, {...matchingClient, nodeStatusId: row.id});  // Include nodeStatusId
          } else {
            //console.log(`No matching client found for socket_id: ${row.socket_id}`);
            //console.log(`Available client IDs: ${Array.from(connectedClients).map(c => c.clientID).join(', ')}`);
          }
        }
      });

      console.log(`Total active clients: ${result.rows.length}`);
      console.log(`Clients at latest block ${largestBlockNumber}: ${filteredClients.size}`);

      return filteredClients;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error in getFilteredConnectedClients:', err);
    return new Map(); // Return an empty Map in case of error
  }
}

async function makeRpcRequest(url, body, headers) {
  try {
    const response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    });
    return response.data;
  } catch (error) {
    console.error("RPC request error:", error);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
}

function validateRpcRequest(req, res, next) {
  const { jsonrpc, method, id } = req.body;
  if (jsonrpc !== "2.0" || !method || id === undefined) {
    return res.status(400).send({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32600,
        message: "Invalid Request",
        data: "The JSON sent is not a valid Request object"
      }
    });
  }
  next();
}

function generateMessageId(message, clientIp) {
  const hash = crypto.createHash('sha256');
  const timestamp = Date.now();
  hash.update(JSON.stringify(message) + clientIp + timestamp);
  return hash.digest('hex');
}

async function incrementRpcRequests(clientID) {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      await client.query(`
        UPDATE node_status
        SET n_rpc_requests = COALESCE(n_rpc_requests, 0) + 1
        WHERE socket_id = $1
      `, [clientID]);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error incrementing n_rpc_requests:', err);
  }
}

// Add this function to increment points for an owner
async function incrementOwnerPoints(owner) {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO owner_points (owner, points)
        VALUES ($1, 10)
        ON CONFLICT (owner)
        DO UPDATE SET points = owner_points.points + 10
      `, [owner]);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error incrementing owner points:', err);
  }
}

// Add this Map to store start times for each bgMessageId
const requestStartTimes = new Map();

// Add this function near the top of the file, with other function declarations
async function updateRequestOrigin(reqHost) {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      // Upsert query to insert or update the request_host table
      const upsertQuery = `
        INSERT INTO request_host (host, n_requests)
        VALUES ($1, 1)
        ON CONFLICT (host)
        DO UPDATE SET n_requests = request_host.n_requests + 1
      `;
      await client.query(upsertQuery, [reqHost]);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error updating request_host:', err);
  }
}

// Modify the POST route handler
app.post("/", validateRpcRequest, async (req, res) => {
  console.log("\n\n📡 RPC REQUEST", req.body);
  
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

  const filteredConnectedClients = await getFilteredConnectedClients();

  if(filteredConnectedClients.size > 0) {
    const clientsArray = Array.from(filteredConnectedClients.values());
    const randomClient = clientsArray[Math.floor(Math.random() * clientsArray.length)];
    
    if (randomClient && randomClient.ws) {
      try {
        const clientIp = req.ip || req.connection.remoteAddress;
        const messageId = generateMessageId(req.body, clientIp);

        console.log('Adding new open message with id:', messageId);
        openMessages.set(messageId, { req, res, timestamp: Date.now(), rpcId: req.body.id });

        // Store the start time for this messageId
        requestStartTimes.set(messageId, performance.now());

        const modifiedMessage = {
          ...req.body,
          bgMessageId: messageId
        };

        randomClient.ws.send(JSON.stringify(modifiedMessage));

        setTimeout(() => {
          if (openMessages.has(messageId)) {
            console.log('Timeout reached for message:', messageId);
            const { res, rpcId } = openMessages.get(messageId);
            res.status(504).json({
              jsonrpc: "2.0",
              id: rpcId,
              error: {
                code: -32603,
                message: "Gateway Timeout",
                data: "No response received from the node"
              }
            });
            openMessages.delete(messageId);
          }
        }, wsMessageTimeout);

      } catch (error) {
        console.error("Error sending RPC request:", error);
        res.status(500).json({
          jsonrpc: "2.0",
          id: req.body.id,
          error: {
            code: -32603,
            message: "Internal error",
            data: error.message
          }
        });
      }
    } else {
      console.log("Selected client is invalid or has no WebSocket connection");
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
    console.log("NO CLIENTS CONNECTED, using fallback mechanism");
    try {
      const result = await makeRpcRequest(targetUrl, req.body, req.headers);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
          code: -32603,
          message: "Internal error",
          data: error.message
        }
      });
    }
  }

  console.log("POST SERVED", req.body);
});

app.get("/", (req, res) => {
  console.log("GET", req.headers.referer);
  axios
    .get(targetUrl, {
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

// Add this function to handle WebSocket check-ins
async function handleWebSocketCheckin(ws, message) {
  const checkinData = JSON.parse(message);
  const logMessages = [];

  logMessages.push(`WebSocket CHECKIN`);
  logMessages.push(`Check-in data: ${JSON.stringify(checkinData)}`);

  getDbPool().then(async (pool) => {
    const client = await pool.connect();
    try {
      // Extract data from the check-in message
      const {
        id,
        node_version,
        execution_client,
        consensus_client,
        cpu_usage,
        memory_usage,
        storage_usage,
        block_number,
        block_hash,
        execution_peers,
        consensus_peers,
        git_branch,
        last_commit,
        commit_hash,
        enode,
        peerid,
        consensus_tcp_port,
        consensus_udp_port,
        enr,
        socket_id,
        owner
      } = checkinData;

      // Parse numeric values
      const parsedCpuUsage = parseFloat(cpu_usage) || null;
      const parsedMemoryUsage = parseFloat(memory_usage) || null;
      const parsedStorageUsage = parseFloat(storage_usage) || null;
      const parsedBlockNumber = block_number ? BigInt(block_number) : null;
      const parsedExecutionPeers = parseInt(execution_peers) || null;
      const parsedConsensusPeers = parseInt(consensus_peers) || null;
      const parsedConsensusTcpPort = parseInt(consensus_tcp_port) || null;
      const parsedConsensusUdpPort = parseInt(consensus_udp_port) || null;

      const decodedPeerID = peerid ? decodeURIComponent(peerid) : null;
      const decodedENR = enr ? decodeURIComponent(enr) : null;

      // Get the client's IP address from the WebSocket connection
      const ip_address = ws._socket.remoteAddress.replace(/^::ffff:/, '');
      const currentEpoch = Math.floor(Date.now() / 1000);

      // Query existing record
      const existingRecordQuery = `
        SELECT ip_loc_lookup_epoch, country, country_code, region, city, lat, lon, continent
        FROM node_status
        WHERE id = $1
      `;
      const existingRecord = await client.query(existingRecordQuery, [id]);
      
      // console.log('Existing record:', existingRecord.rows[0]);

      let locationData = null;
      let shouldUpdateLocation = false;

      if (existingRecord.rows.length > 0) {
        const lastLookupEpoch = existingRecord.rows[0].ip_loc_lookup_epoch;
        if (!lastLookupEpoch || (currentEpoch - lastLookupEpoch > 86400)) {
          shouldUpdateLocation = true;
        }
      } else {
        shouldUpdateLocation = true;
      }

      // console.log('Should update location:', shouldUpdateLocation);

      if (shouldUpdateLocation) {
        locationData = await getIpLocation(ip_address);
        console.log('New location data:', locationData);
        logMessages.push(`Updated location data for IP: ${ip_address}`);
      } else {
        logMessages.push(`Using existing location data for IP: ${ip_address}`);
      }

      // Prepare location-related parameters
      const locationParams = shouldUpdateLocation && locationData ? [
        locationData.country,
        locationData.countryCode,
        locationData.region,
        locationData.city,
        locationData.lat,
        locationData.lon,
        currentEpoch,
        locationData.continent
      ] : [
        existingRecord.rows[0].country,
        existingRecord.rows[0].country_code,
        existingRecord.rows[0].region,
        existingRecord.rows[0].city,
        existingRecord.rows[0].lat,
        existingRecord.rows[0].lon,
        existingRecord.rows[0].ip_loc_lookup_epoch,
        existingRecord.rows[0].continent
      ];

      // console.log('Location params:', locationParams);

      // Modify the upsert query to ensure continent is treated as text
      const upsertQuery = `
        INSERT INTO node_status (
          id, node_version, execution_client, consensus_client, 
          cpu_usage, memory_usage, storage_usage, block_number, block_hash, last_checkin, ip_address, execution_peers, consensus_peers,
          git_branch, last_commit, commit_hash, enode, peerid, consensus_tcp_port, consensus_udp_port, enr, socket_id, owner,
          country, country_code, region, city, lat, lon, ip_loc_lookup_epoch, continent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
        ON CONFLICT (id) DO UPDATE SET
          node_version = EXCLUDED.node_version,
          execution_client = EXCLUDED.execution_client,
          consensus_client = EXCLUDED.consensus_client,
          cpu_usage = EXCLUDED.cpu_usage,
          memory_usage = EXCLUDED.memory_usage,
          storage_usage = EXCLUDED.storage_usage,
          block_number = EXCLUDED.block_number,
          block_hash = EXCLUDED.block_hash,
          last_checkin = CURRENT_TIMESTAMP,
          ip_address = EXCLUDED.ip_address,
          execution_peers = EXCLUDED.execution_peers,
          consensus_peers = EXCLUDED.consensus_peers,
          git_branch = EXCLUDED.git_branch,
          last_commit = EXCLUDED.last_commit,
          commit_hash = EXCLUDED.commit_hash,
          enode = EXCLUDED.enode,
          peerid = EXCLUDED.peerid,
          consensus_tcp_port = EXCLUDED.consensus_tcp_port,
          consensus_udp_port = EXCLUDED.consensus_udp_port,
          enr = EXCLUDED.enr,
          socket_id = EXCLUDED.socket_id,
          owner = EXCLUDED.owner,
          country = COALESCE(EXCLUDED.country, node_status.country),
          country_code = COALESCE(EXCLUDED.country_code, node_status.country_code),
          region = COALESCE(EXCLUDED.region, node_status.region),
          city = COALESCE(EXCLUDED.city, node_status.city),
          lat = COALESCE(EXCLUDED.lat, node_status.lat),
          lon = COALESCE(EXCLUDED.lon, node_status.lon),
          ip_loc_lookup_epoch = COALESCE(EXCLUDED.ip_loc_lookup_epoch, node_status.ip_loc_lookup_epoch),
          continent = COALESCE(EXCLUDED.continent, node_status.continent)
      `;

      const queryParams = [
        id, node_version, execution_client, consensus_client,
        parsedCpuUsage, parsedMemoryUsage, parsedStorageUsage, parsedBlockNumber, block_hash, ip_address, parsedExecutionPeers, parsedConsensusPeers,
        git_branch, last_commit, commit_hash, enode, decodedPeerID, parsedConsensusTcpPort, parsedConsensusUdpPort, decodedENR, socket_id, owner,
        locationParams[0], // country
        locationParams[1], // country_code
        locationParams[2], // region
        locationParams[3], // city
        locationParams[4], // lat
        locationParams[5], // lon
        locationParams[6], // ip_loc_lookup_epoch
        locationParams[7]  // continent
      ];

      const result = await client.query(upsertQuery, queryParams);
      logMessages.push(`Rows affected: ${result.rowCount}`);

      if (shouldUpdateLocation && locationData) {
        logMessages.push(`Country: ${locationData.country}, Region: ${locationData.region}, City: ${locationData.city}, Continent: ${locationData.continent}`);
        logMessages.push(`IP location lookup epoch: ${currentEpoch}`);
      }

      // ws.send(JSON.stringify({ success: true, messages: logMessages }));
    } catch (err) {
      console.error('Error in WebSocket checkin:', err);
      logMessages.push('Error updating node status:', err.message);
      ws.send(JSON.stringify({ error: "An error occurred during check-in", messages: logMessages }));
    } finally {
      client.release();
    }
  }).catch(err => {
    console.error('Error getting DB pool:', err);
    ws.send(JSON.stringify({ error: "Database connection error" }));
  });
}

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
          console.log(`Found matching open message with id ${messageId}. Sending response.`);
          const openMessage = openMessages.get(messageId);
          const responseWithOriginalId = {
            ...parsedMessage,
            id: openMessage.rpcId
          };
          delete responseWithOriginalId.bgMessageId;
          openMessage.res.json(responseWithOriginalId);
          openMessages.delete(messageId);

          // Log the RPC request with timing information
          logRpcRequest(openMessage.req, messageId);

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

function listConnectedClients() {
  return Array.from(connectedClients).map((client, index) => {
    return `Client ${index + 1}: (${client.clientID}) ${client.ws._socket.remoteAddress}:${client.ws._socket.remotePort}`;
  });
}

// Start the HTTPS server (which now includes WebSocket)
server.listen(httpsPort, () => {
  console.log(`HTTPS and WebSocket server listening on port ${httpsPort}...`);
});

setInterval(checkForFallback, 5000);
checkForFallback();

// Add a cleanup function to remove old open messages
function cleanupOpenMessages() {
  const now = Date.now();
  for (const [id, message] of openMessages) {
    if (now - message.timestamp > messageCleanupInterval) { // 1 minute timeout
      console.log(`Removing timed out message: ${id}`);
      message.res.status(504).json({
        jsonrpc: "2.0",
        id: id,
        error: {
          code: -32603,
          message: "Gateway Timeout",
          data: "No response received from the node"
        }
      });
      openMessages.delete(id);
    }
  }
}

setInterval(cleanupOpenMessages, messageCleanupInterval);

async function getOwnerForClientId(clientId) {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT owner
        FROM node_status
        WHERE socket_id = $1
      `, [clientId]);
      
      if (result.rows.length > 0) {
        return { owner: result.rows[0].owner };
      } else {
        return null;
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error getting owner for client ID:', err);
    return null;
  }
}

function logRpcRequest(req, messageId) {
  const { method, params } = req.body;
  const startTime = requestStartTimes.get(messageId);
  const endTime = performance.now();
  const duration = endTime - startTime;

  let logEntry = `${method}|`;
  
  if (params && Array.isArray(params)) {
    logEntry += params.map(param => {
      if (typeof param === 'object' && param !== null) {
        return JSON.stringify(param);
      }
      return param;
    }).join(',');
  }
  
  logEntry += `|${duration.toFixed(3)}\n`;
  
  fs.appendFile('rpcRequests.log', logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });

  // Clean up the start time
  requestStartTimes.delete(messageId);
}

module.exports = {
  app,
  connectedClients,
  openMessages,
  requestStartTimes,
  // incrementRpcRequests,
  // incrementOwnerPoints,
  getOwnerForClientId
};