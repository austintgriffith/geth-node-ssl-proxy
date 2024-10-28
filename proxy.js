const https = require("https");
var httpProxy = require("http-proxy");
const express = require("express");
const axios = require("axios");
const fs = require("fs");
var cors = require("cors");
var bodyParser = require("body-parser");
var app = express();
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require('pg');
const { createPublicClient, http } = require('viem');
const { mainnet } = require('viem/chains');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');  // Optional for generating a unique ID
const EventEmitter = require('events');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
EventEmitter.defaultMaxListeners = 20; // Increase the default max listeners

const openMessages = new Map();

const localProviderUrl = "https://office.buidlguidl.com:48544/";

const client = createPublicClient({
  chain: mainnet,
  transport: http(localProviderUrl)
});

https.globalAgent.options.ca = require("ssl-root-cas").create();
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

app.use(bodyParser.json());
app.use(cors());
//app.use(express.json())
//app.use(express.bodyParser());
//app.use(bodyParser.json());

var proxy = httpProxy.createProxyServer();

var last = "";

var memcache = {};
var methods = {};
var methodsByReferer = {};
/*
setInterval(()=>{
  console.log("--------------------=============------------------")
  var sortable = [];
  for (var item in memcache) {
      sortable.push([item, memcache[item]]);
  }
≈  sortable.sort(function(a, b) {
      return a[1] - b[1];
  });
  console.log(sortable)
  console.log("--------------------=============------------------")
},60000)
*/

const targetUrl = "https://office.buidlguidl.com:48544";

let fallbackUrl = "";

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

// Add this function at the top of your file
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

// Add this function to generate a unique message identifier
function generateMessageId(message, clientIp) {
  const hash = crypto.createHash('sha256');
  const timestamp = Date.now();
  hash.update(JSON.stringify(message) + clientIp + timestamp);
  return hash.digest('hex');
}

// Add this function to increment n_rpc_requests
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
        }, 30000);

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

app.get("/proxy", (req, res) => {
  console.log("/PROXY", req.headers.referer);
  res.send(
    "<html><body><div style='padding:20px;font-size:18px'><H1>PROXY TO:</H1></div><pre>" +
      targetUrl +
      "</pre></body></html>"
  );
});

let pool;

require('dotenv').config();

async function getDbConfig() {
  const secret_name = process.env.RDS_SECRET_NAME;
  const client = new SecretsManagerClient({ 
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secret_name,
        VersionStage: "AWSCURRENT",
      })
    );
    const secret = JSON.parse(response.SecretString);

    return {
      host: 'bgclientdb.cluster-cjoo0gi8an8c.us-east-1.rds.amazonaws.com',
      user: secret.username,
      password: secret.password,
      database: secret.dbname || 'postgres',
      port: 5432,
      ssl: true
    };
  } catch (error) {
    console.error("Error fetching database secret:", error);
    throw error;
  }
}

async function getDbPool() {
  if (!pool) {
    const dbConfig = await getDbConfig();
    pool = new Pool(dbConfig);
  }
  return pool;
}

// Replace all instances of `pool.connect()` with `getDbPool()`

// For example, update the /active route:
app.get("/active", async (req, res) => {
  //console.log("/ACTIVE", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      // First, get the total count of records
      const countResult = await client.query('SELECT COUNT(*) FROM node_status');
      const totalRecords = countResult.rows[0].count;

      // Now, query for active nodes
      const minutes = req.query.minutes ? parseInt(req.query.minutes) : 5; // Default to 5 minutes if not provided
      const result = await client.query(`
        SELECT id, node_version, execution_client, consensus_client, 
               cpu_usage, memory_usage, storage_usage, block_number, 
               block_hash, last_checkin, ip_address, execution_peers, consensus_peers,
               git_branch, last_commit, commit_hash, enode, 
               COALESCE(peerid, 'NULL_VALUE') as peerid,
               consensus_tcp_port, consensus_udp_port, enr, socket_id, n_rpc_requests,
               country, country_code, region, city, lat, lon, ip_loc_lookup_epoch, continent, owner
        FROM node_status
        WHERE last_checkin > NOW() - INTERVAL '${minutes} minutes'
        ORDER BY ip_address DESC, id ASC
      `);

      //console.log(`Total records in node_status: ${totalRecords}`);
      //console.log(`Active records found: ${result.rows.length}`);

      let tableRows = result.rows.map(row => `
        <tr>
          <td>${row.id}</td>  
          <td><a href="https://ethernodes.org/node/${row.ip_address}" target="_blank">${row.ip_address}</a></td>
          <td>${row.owner === 'NULL_VALUE' ? 'null' : row.owner}</td>
          <td>${row.n_rpc_requests === 'NULL_VALUE' ? 'null' : row.n_rpc_requests}</td>
          <td>${row.block_number}</td>
          <td>${row.block_hash}</td>
          <td>${new Date(row.last_checkin).toString().replace(' GMT+0000 (Coordinated Universal Time)', '')}</td>
          <td>${row.node_version}</td>
          <td>${row.execution_client}</td>
          <td>${row.consensus_client}</td>
          <td>${row.cpu_usage}</td>
          <td>${row.memory_usage}</td>
          <td>${row.storage_usage}</td>
          <td>${row.execution_peers}</td>
          <td>${row.consensus_peers}</td>
          <td>${row.git_branch}</td>
          <td>${row.last_commit}</td>
          <td><a href="https://github.com/BuidlGuidl/buidlguidl-client/commit/${row.commit_hash}" target="_blank">${row.commit_hash}</a></td>
          <td>${row.enode}</td>
          <td>${row.peerid === 'NULL_VALUE' ? 'null' : row.peerid}</td>
          <td>${row.consensus_tcp_port === 'NULL_VALUE' ? 'null' : row.consensus_tcp_port}</td>
          <td>${row.consensus_udp_port === 'NULL_VALUE' ? 'null' : row.consensus_udp_port}</td>
          <td>${row.enr === 'NULL_VALUE' ? 'null' : row.enr}</td>
          <td>${row.socket_id === 'NULL_VALUE' ? 'null' : row.socket_id}</td>
          <td>${row.continent === 'NULL_VALUE' ? 'null' : row.continent}</td>
          <td>${row.country === 'NULL_VALUE' ? 'null' : row.country}</td>
          <td>${row.country_code === 'NULL_VALUE' ? 'null' : row.country_code}</td>
          <td>${row.region === 'NULL_VALUE' ? 'null' : row.region}</td>
          <td>${row.city === 'NULL_VALUE' ? 'null' : row.city}</td>
          <td>${row.lat === 'NULL_VALUE' ? 'null' : row.lat}</td>
          <td>${row.lon === 'NULL_VALUE' ? 'null' : row.lon}</td>
          <td>${row.ip_loc_lookup_epoch === 'NULL_VALUE' ? 'null' : row.ip_loc_lookup_epoch}</td>
        </tr>
      `).join('');

      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>ACTIVE NODES (Last ${minutes} minutes)</h1>
              <p>Total records in database: ${totalRecords}</p>
              <p>Active records: ${result.rows.length}</p>
              <table border="1" cellpadding="5">
                <tr>
                  <th>ID</th>
                  <th>IP Address</th>
                  <th>Owner</th>
                  <th>RPC Requests</th>
                  <th>Block Number</th>
                  <th>Block Hash</th>
                  <th>Last Checkin (UTC)</th>
                  <th>Node Version</th>
                  <th>Execution Client</th>
                  <th>Consensus Client</th>
                  <th>CPU Usage</th>
                  <th>Memory Usage</th>
                  <th>Storage Usage</th>
                  <th>Execution Peers</th>
                  <th>Consensus Peers</th>
                  <th>Git Branch</th>
                  <th>Last Commit</th>
                  <th>Commit Hash</th>
                  <th>Enode (execution)</th>
                  <th>Peer ID (consensus)</th>
                  <th>Consensus TCP Port</th>
                  <th>Consensus UDP Port</th>
                  <th>ENR (consensus)</th>
                  <th>Socket ID</th>
                  <th>Continent</th>
                  <th>Country</th>
                  <th>Country Code</th>
                  <th>Region</th>
                  <th>City</th>
                  <th>Lat</th>
                  <th>Lon</th>
                  <th>IP Loc Lookup Epoch</th>
                </tr>
                ${tableRows}
              </table>
            </div>
          </body>
        </html>
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving active nodes:', err);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <h1>ERROR RETRIEVING ACTIVE NODES</h1>
            <p>An error occurred while trying to retrieve active nodes from the database.</p>
            <p>Error details: ${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

app.get("/checkin", async (req, res) => {
  let logMessages = [];

  logMessages.push(`/CHECKIN ${req.headers.referer}`);
  logMessages.push(`Request query parameters: ${JSON.stringify(req.query)}`);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    //console.log('🚀 🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
    try {
      // Extract data from query parameters
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
      } = req.query;

      //console.log('Raw peerid:', peerid);
      //console.log('Raw enr:', enr);  // Add this line to log the raw enr

      // Decode peerid and enr
      const decodedPeerID = peerid ? decodeURIComponent(peerid) : null;
      const decodedENR = enr ? decodeURIComponent(enr) : null;  // Add this line to decode the enr
      //console.log('Decoded peerID:', decodedPeerID);
      //console.log('Decoded ENR:', decodedENR);  // Add this line to log the decoded enr

      // Get the client's IP address
      const ip_address = (req.ip || req.connection.remoteAddress).replace(/^::ffff:/, '');

      // Validate required fields
      if (!id) {
        logMessages.push("Missing required parameter: id");
        return res.status(400).send(logMessages.join("<br>"));
      }

      // Convert numeric fields and provide default values
      const parsedCpuUsage = parseFloat(cpu_usage) || null;
      const parsedMemoryUsage = parseFloat(memory_usage) || null;
      const parsedStorageUsage = parseFloat(storage_usage) || null;
      const parsedBlockNumber = block_number ? BigInt(block_number) : null;
      const parsedExecutionPeers = parseInt(execution_peers) || null;
      const parsedConsensusPeers = parseInt(consensus_peers) || null;
      const parsedConsensusTcpPort = parseInt(consensus_tcp_port) || null;
      const parsedConsensusUdpPort = parseInt(consensus_udp_port) || null;

      const upsertQuery = `
        INSERT INTO node_status (
          id, node_version, execution_client, consensus_client, 
          cpu_usage, memory_usage, storage_usage, block_number, block_hash, last_checkin, ip_address, execution_peers, consensus_peers,
          git_branch, last_commit, commit_hash, enode, peerid, consensus_tcp_port, consensus_udp_port, enr, socket_id, owner  
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)  
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
          owner = EXCLUDED.owner 
      `;

      const queryParams = [
        id, node_version, execution_client, consensus_client,
        parsedCpuUsage, parsedMemoryUsage, parsedStorageUsage, parsedBlockNumber, block_hash, ip_address, parsedExecutionPeers, parsedConsensusPeers,
        git_branch, last_commit, commit_hash, enode, decodedPeerID, parsedConsensusTcpPort, parsedConsensusUdpPort, decodedENR, socket_id, owner
      ];

      //console.log('Query parameters:', queryParams);

      const result = await client.query(upsertQuery, queryParams);
      //console.log('Upsert result:', result);
      logMessages.push(`Rows affected: ${result.rowCount}`);

      // Add this query to check the stored value immediately after the upsert
      const checkQuery = 'SELECT peerid, consensus_tcp_port, consensus_udp_port, enr, socket_id FROM node_status WHERE id = $1';
      const checkResult = await client.query(checkQuery, [id]);
      //console.log('Stored values:', checkResult.rows[0]);

      logMessages.push("CHECKIN SUCCESSFUL");
      logMessages.push(`Node status updated for ID: ${id}`);
      logMessages.push(`IP Address: ${ip_address}`);
      logMessages.push(`peerid: ${decodedPeerID}`);
      logMessages.push(`Consensus TCP Port: ${parsedConsensusTcpPort}`);
      logMessages.push(`Consensus UDP Port: ${parsedConsensusUdpPort}`);
      logMessages.push(`ENR: ${decodedENR}`);
      logMessages.push(`Socket ID: ${socket_id}`);

      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              ${logMessages.join("<br>")}
            </div>
          </body>
        </html>
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error in /checkin:', err);
    logMessages.push('Error updating node status:', err.message);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            ${logMessages.join("<br>")}
          </div>
        </body>
      </html>
    `);
  }
});

app.get("/points", async (req, res) => {
  // console.log("/POINTS", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      // Query for all entries in the owner_points table
      const result = await client.query(`
        SELECT owner, points
        FROM owner_points
        ORDER BY points DESC
      `);

      // console.log(`Total records found: ${result.rows.length}`);

      let tableRows = result.rows.map(row => `
        <tr>
          <td>${row.owner}</td>
          <td>${row.points}</td>
        </tr>
      `).join('');

      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>OWNER POINTS</h1>
              <p>Total records: ${result.rows.length}</p>
              <table border="1" cellpadding="5">
                <tr>
                  <th>Owner</th>
                  <th>Points</th>
                </tr>
                ${tableRows}
              </table>
            </div>
          </body>
        </html>
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving owner points:', err);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <h1>ERROR RETRIEVING OWNER POINTS</h1>
            <p>An error occurred while trying to retrieve owner points from the database.</p>
            <p>Error details: ${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

app.get("/yourpoints", async (req, res) => {
  // console.log("/YOURPOINTS", req.headers.referer);

  const owner = req.query.owner;

  if (!owner) {
    return res.status(400).json({ error: "Missing required parameter: owner" });
  }

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT points FROM owner_points WHERE owner = $1',
        [owner]
      );

      if (result.rows.length > 0) {
        const points = result.rows[0].points;
        res.json({ owner, points });
      } else {
        res.json({ owner, points: 0 });
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving points for owner:', err);
    res.status(500).json({ error: "An error occurred while retrieving points" });
  }
});

app.get("/methods", (req, res) => {
  console.log("/methods", req.headers.referer);
  res.send(
    "<html><body><div style='padding:20px;font-size:18px'><H1>methods:</H1></div><pre>" +
      JSON.stringify(methods) +
      "</pre></body></html>"
  );
});

app.get("/methodsByReferer", (req, res) => {
  console.log("/methods", req.headers.referer);
  res.send(
    "<html><body><div style='padding:20px;font-size:18px'><H1>methods by referer:</H1></div><pre>" +
      JSON.stringify(methodsByReferer) +
      "</pre></body></html>"
  );
});

app.get("/letathousandscaffoldethsbloom", (req, res) => {
  //if(req.headers&&req.headers.referer&&req.headers.referer.indexOf("sandbox.eth.build")>=0){
  var sortable = [];
  for (var item in memcache) {
    sortable.push([item, memcache[item]]);
  }
  sortable.sort(function (a, b) {
    return b[1] - a[1];
  });
  let finalBody = "";
  for (let s in sortable) {
    console.log(sortable[s]);
    finalBody +=
      "<div style='padding:10px;font-size:18px'> <a href='" +
      sortable[s][0] +
      "'>" +
      sortable[s][0] +
      "</a>(" +
      sortable[s][1] +
      ")</div>";
  }
  //JSON.stringify(sortable)
  res.send(
    "<html><body><div style='padding:20px;font-size:18px'><H1>RPC TRAFFIC</H1></div><pre>" +
      finalBody +
      "</pre></body></html>"
  );
});

app.get("/sync", async (req, res) => {
  console.log(" 🏷 sync ");

  try {
    const syncStatus = await client.request({ method: 'eth_syncing' });
    
    if (syncStatus === false) {
      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <H1 style="color:green;">IN SYNC!</H1>
            </div>
          </body>
        </html>
      `);
    } else {
      const currentBlock = BigInt(syncStatus.currentBlock);
      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <H1>SYNCING</H1>
            </div>
            <pre>${JSON.stringify(syncStatus, null, 2)}</pre>
            <div>currentBlock</div>
            <b>${currentBlock.toString()}</b>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error("SYNC ERROR", error);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <H1>SYNC ERROR</H1>
          </div>
          <pre>${error.message}</pre>
        </body>
      </html>
    `);
  }
});

app.get("/block", async (req, res) => {
  console.log(" 🛰 block ");

  try {
    const blockNumber = await client.getBlockNumber();
    res.send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <H1>BLOCK</H1>
          </div>
          <pre>${blockNumber}</pre>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("BLOCK ERROR", error);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <H1>BLOCK ERROR</H1>
          </div>
          <pre>${error.message}</pre>
        </body>
      </html>
    `);
  }
});

app.get("/time", async (req, res) => {
  console.log("/TIME", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT CURRENT_TIMESTAMP');
      const currentTime = result.rows[0].current_timestamp;
      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>CURRENT DATABASE TIME</h1>
              <p>${currentTime}</p>
            </div>
          </body>
        </html>
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving time from database:', err);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <h1>ERROR RETRIEVING TIME</h1>
            <p>An error occurred while trying to retrieve the time from the database.</p>
          </div>
        </body>
      </html>
    `);
  }
});

const httpsPort = 48544;

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

  // Store the client's IP address
  const clientIpAddress = ws._socket.remoteAddress.replace(/^::ffff:/, '');

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
}, 30000);

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

app.get("/enodes", async (req, res) => {
  // console.log("/ENODES", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          enode,
          CASE 
            WHEN execution_client LIKE 'reth%' THEN 'reth'
            WHEN execution_client LIKE 'geth%' THEN 'geth'
            ELSE SPLIT_PART(execution_client, ' ', 1)
          END AS execution_client
        FROM node_status
        WHERE enode IS NOT NULL 
          AND enode != ''
          AND last_checkin > NOW() - INTERVAL '5 minutes'
      `);

      const enodes = result.rows.map(row => ({
        enode: row.enode,
        executionClient: row.execution_client
      }));

      res.json({ enodes });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving enodes:', err);
    res.status(500).json({ error: "An error occurred while retrieving enodes" });
  }
});

app.get("/consensusPeerAddr", async (req, res) => {
  console.log("/CONSENSUS_PEER_ADDR", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          id,
          ip_address,
          consensus_tcp_port,
          consensus_udp_port,
          peerid,
          SPLIT_PART(consensus_client, ' ', 1) AS consensus_client,
          enr
        FROM node_status
        WHERE peerid IS NOT NULL 
          AND peerid != ''
          AND peerid != 'null'
          AND ip_address IS NOT NULL
          AND consensus_tcp_port IS NOT NULL
          AND consensus_udp_port IS NOT NULL
          AND last_checkin > NOW() - INTERVAL '5 minutes'
      `);

      const consensusPeerAddrs = result.rows.reduce((acc, row) => {
        const clientType = row.consensus_client.toLowerCase();
        let consensusPeerAddr;

        if (clientType === "lighthouse") {
          consensusPeerAddr = `/ip4/${row.ip_address}/tcp/${row.consensus_tcp_port}/p2p/${row.peerid},/ip4/${row.ip_address}/udp/${row.consensus_udp_port}/quic-v1/p2p/${row.peerid}`;
        } else if (clientType === "prysm") {
          if (row.enr && row.enr !== '' && row.enr !== 'null') {
            consensusPeerAddr = row.enr;
          } else {
            return acc; // Skip this row if ENR is not valid
          }
        } else {
          // Default format for other clients
          consensusPeerAddr = `/ip4/${row.ip_address}/tcp/${row.consensus_tcp_port}/p2p/${row.peerid},/ip4/${row.ip_address}/udp/${row.consensus_udp_port}/quic-v1/p2p/${row.peerid}`;
        }

        acc.push({
          machineID: row.id,
          consensusPeerAddr: consensusPeerAddr,
          consensusClient: clientType
        });

        return acc;
      }, []);

      res.json({ consensusPeerAddrs });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving consensus peer addresses:', err);
    res.status(500).json({ error: "An error occurred while retrieving consensus peer addresses" });
  }
});

app.get("/peerids", async (req, res) => {
  // console.log("/PEERIDS", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          peerid,
          enode,
          CASE 
            WHEN consensus_client LIKE 'lighthouse%' THEN 'lighthouse'
            WHEN consensus_client LIKE 'prysm%' THEN 'prysm'
            ELSE SPLIT_PART(consensus_client, ' ', 1)
          END AS consensus_client
        FROM node_status
        WHERE peerid IS NOT NULL 
          AND peerid != ''
          AND enode IS NOT NULL
          AND enode != ''
          AND last_checkin > NOW() - INTERVAL '5 minutes'
      `);

      const peerids = result.rows.map(row => {
        // Extract IP:Port from enode
        const enodeMatch = row.enode.match(/@([^:]+):(\d+)/);
        const ipPort = enodeMatch ? `${enodeMatch[1]}:${enodeMatch[2]}` : null;

        return {
          peerid: row.peerid,
          ipPort: ipPort,
          consensusClient: row.consensus_client
        };
      });

      res.json({ peerids });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving peerids:', err);
    res.status(500).json({ error: "An error occurred while retrieving peerids" });
  }
});

app.get("/IPLOCATIONS", async (req, res) => {
  console.log("/IPLOCATIONS", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT ip_address, lat, lon, COUNT(*) as node_count
        FROM node_status
        WHERE lat IS NOT NULL AND lon IS NOT NULL
        GROUP BY ip_address, lat, lon
      `);

      const ipLocations = result.rows.map(row => ({
        name: `${row.node_count} Node${row.node_count > 1 ? 's' : ''}`,
        position: [parseFloat(row.lat), parseFloat(row.lon)]
      }));

      res.json({ ipLocations });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving IP locations:', err);
    res.status(500).json({ error: "An error occurred while retrieving IP locations" });
  }
});

setInterval(checkForFallback, 5000);
checkForFallback();

async function getIpLocation(ipAddress) {
  try {
    // const response = await axios.get(`http://ip-api.com/json/${ipAddress}?fields=continent,country,countryCode,region,city,lat,lon`);
    const response = await axios.get(`https://pro.ip-api.com/json/${ipAddress}?fields=continent,country,countryCode,region,city,lat,lon&key=xCoYoyXtdmYbpvJ`);
    console.log('IP API response:', response.data);  // Add this line
    return response.data;
  } catch (error) {
    console.error(`Error fetching location for IP ${ipAddress}:`, error.message);
    return null;
  }
}

// Add a cleanup function to remove old open messages
function cleanupOpenMessages() {
  const now = Date.now();
  for (const [id, message] of openMessages) {
    if (now - message.timestamp > 60000) { // 1 minute timeout
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

// Run the cleanup function every minute
setInterval(cleanupOpenMessages, 60000);

// Helper function to find the closest ID
function findClosestId(targetId, ids) {
  return ids.reduce((closest, current) => {
    return Math.abs(current - targetId) < Math.abs(closest - targetId) ? current : closest;
  });
}

// Add this function to get the owner for a given client ID
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

// Update the logRpcRequest function
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

app.get("/requestorigins", async (req, res) => {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT host, n_requests
        FROM request_host
        ORDER BY n_requests DESC
      `);

      let tableRows = result.rows.map(row => `
        <tr>
          <td><a href="http://${row.host}" target="_blank">${row.host}</a></td>
          <td>${row.n_requests}</td>
        </tr>
      `).join('');

      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>REQUEST ORIGINS</h1>
              <p>Total unique hosts: ${result.rows.length}</p>
              <table border="1" cellpadding="5">
                <tr>
                  <th>Origin</th>
                  <th>Number of Requests</th>
                </tr>
                ${tableRows}
              </table>
            </div>
          </body>
        </html>
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving request hosts:', err);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <h1>ERROR RETRIEVING REQUEST HOSTS</h1>
            <p>An error occurred while trying to retrieve request hosts from the database.</p>
            <p>Error details: ${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

app.get("/nodecontinents", async (req, res) => {
  // console.log("/NODECONTINENTS", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          COALESCE(continent, 'Unknown') as continent, 
          COUNT(*) as node_count
        FROM node_status
        WHERE last_checkin > NOW() - INTERVAL '5 minutes'
        GROUP BY continent
      `);

      const continents = {
        "North America": 0,
        "South America": 0,
        "Europe": 0,
        "Asia": 0,
        "Africa": 0,
        "Australia": 0
      };

      // Update counts based on query results
      result.rows.forEach(row => {
        if (continents.hasOwnProperty(row.continent)) {
          continents[row.continent] = parseInt(row.node_count);
        }
      });

      res.json({ continents });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving node continents:', err);
    res.status(500).json({ error: "An error occurred while retrieving node continents" });
  }
});