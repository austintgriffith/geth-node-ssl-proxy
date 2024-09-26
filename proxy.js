const https = require("https");
var httpProxy = require("http-proxy");
const express = require("express");
const axios = require("axios");
const fs = require("fs");
var cors = require("cors");
var bodyParser = require("body-parser");
var app = express();
const ethers = require("ethers");
https.globalAgent.options.ca = require("ssl-root-cas").create();
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
const { forEach } = require("ssl-root-cas");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require('pg');
const createRoute = require('./createNodeStatusTable');


const localProviderUrl = "http://localhost:48545";
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


app.post("/", (req, res) => {
  if (req.headers && req.headers.referer) {
    if (last === req.connection.remoteAddress) {
      //process.stdout.write(".");
      //process.stdout.write("-")
    } else {
      last = req.connection.remoteAddress;
      if (!memcache[req.headers.referer]) {
        memcache[req.headers.referer] = 1;
        process.stdout.write(
          "NEW SITE " +
            req.headers.referer +
            " --> " +
            req.connection.remoteAddress
        );
        process.stdout.write("🪐 " + req.connection.remoteAddress);
      } else {
        memcache[req.headers.referer]++;
      }
    }
  }

  if (req.body && req.body.method) {
    methods[req.body.method] = methods[req.body.method]
      ? methods[req.body.method] + 1
      : 1;
    console.log("--> METHOD", req.body.method, "REFERER", req.headers.referer);

    if (!methodsByReferer[req.headers.referer]) {
      methodsByReferer[req.headers.referer] = {};
    }

    methodsByReferer[req.headers.referer] &&
    methodsByReferer[req.headers.referer][req.body.method]
      ? methodsByReferer[req.headers.referer][req.body.method]++
      : (methodsByReferer[req.headers.referer][req.body.method] = 1);
  }
  axios
    .post(targetUrl, req.body, {
      headers: {
        "Content-Type": "application/json",
        ...req.headers,
      },
    })
    .then((response) => {
      console.log("POST RESPONSE", response.data);
      res.status(response.status).send(response.data);
    })
    .catch((error) => {
      console.log("POST ERROR", error);
      res
        .status(error.response ? error.response.status : 500)
        .send(error.message);
    });

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
  console.log("/ACTIVE", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      // Add this query at the beginning of the /active route:
      const schemaQuery = `
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'node_status' AND column_name = 'peerid';
      `;
      const schemaResult = await client.query(schemaQuery);
      console.log('peerID column schema:', schemaResult.rows[0]);

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
               consensus_tcp_port, consensus_udp_port, enr
        FROM node_status
        WHERE last_checkin > NOW() - INTERVAL '${minutes} minutes'
        ORDER BY ip_address DESC, id ASC
      `);

      console.log(`Total records in node_status: ${totalRecords}`);
      console.log(`Active records found: ${result.rows.length}`);

      // After executing the query, log the peerID values:
      console.log('PeerID values:', result.rows.map(row => ({ id: row.id, peerid: row.peerid })));

      let tableRows = result.rows.map(row => `
        <tr>
          <td>${row.id}</td>
          <td><a href="https://ethernodes.org/node/${row.ip_address}" target="_blank">${row.ip_address}</a></td>
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
        enr  // Add this line to extract the enr parameter
      } = req.query;

      console.log('Raw peerid:', peerid);
      console.log('Raw enr:', enr);  // Add this line to log the raw enr

      // Decode peerid and enr
      const decodedPeerID = peerid ? decodeURIComponent(peerid) : null;
      const decodedENR = enr ? decodeURIComponent(enr) : null;  // Add this line to decode the enr
      console.log('Decoded peerID:', decodedPeerID);
      console.log('Decoded ENR:', decodedENR);  // Add this line to log the decoded enr

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
          git_branch, last_commit, commit_hash, enode, peerid, consensus_tcp_port, consensus_udp_port, enr
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
          enr = EXCLUDED.enr;
      `;

      const queryParams = [
        id, node_version, execution_client, consensus_client,
        parsedCpuUsage, parsedMemoryUsage, parsedStorageUsage, parsedBlockNumber, block_hash, ip_address, parsedExecutionPeers, parsedConsensusPeers,
        git_branch, last_commit, commit_hash, enode, decodedPeerID, parsedConsensusTcpPort, parsedConsensusUdpPort, decodedENR
      ];

      console.log('Query parameters:', queryParams);

      const result = await client.query(upsertQuery, queryParams);
      console.log('Upsert result:', result);
      logMessages.push(`Rows affected: ${result.rowCount}`);

      // Add this query to check the stored value immediately after the upsert
      const checkQuery = 'SELECT peerid, consensus_tcp_port, consensus_udp_port, enr FROM node_status WHERE id = $1';
      const checkResult = await client.query(checkQuery, [id]);
      console.log('Stored values:', checkResult.rows[0]);

      logMessages.push("CHECKIN SUCCESSFUL");
      logMessages.push(`Node status updated for ID: ${id}`);
      logMessages.push(`IP Address: ${ip_address}`);
      logMessages.push(`peerid: ${decodedPeerID}`);
      logMessages.push(`Consensus TCP Port: ${parsedConsensusTcpPort}`);
      logMessages.push(`Consensus UDP Port: ${parsedConsensusUdpPort}`);
      logMessages.push(`ENR: ${decodedENR}`);

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
  console.log("/POINTS", req.headers.referer);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      // Query for all entries in the ip_points table
      const result = await client.query(`
        SELECT ip_address, points
        FROM ip_points
        ORDER BY points DESC
      `);

      console.log(`Total records found: ${result.rows.length}`);

      let tableRows = result.rows.map(row => `
        <tr>
          <td>${row.ip_address}</td>
          <td>${row.points}</td>
        </tr>
      `).join('');

      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>IP POINTS</h1>
              <p>Total records: ${result.rows.length}</p>
              <table border="1" cellpadding="5">
                <tr>
                  <th>IP Address</th>
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
    console.error('Error retrieving IP points:', err);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <h1>ERROR RETRIEVING IP POINTS</h1>
            <p>An error occurred while trying to retrieve IP points from the database.</p>
            <p>Error details: ${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

app.get("/yourpoints", async (req, res) => {
  console.log("/YOURPOINTS", req.headers.referer);

  const ipAddress = req.query.ipaddress;

  if (!ipAddress) {
    return res.status(400).json({ error: "Missing required parameter: ipaddress" });
  }

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT points FROM ip_points WHERE ip_address = $1',
        [ipAddress]
      );

      if (result.rows.length > 0) {
        const points = result.rows[0].points;
        res.json({ ipAddress, points });
      } else {
        res.json({ ipAddress, points: 0 });
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving points for IP:', err);
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

app.get("/sync", (req, res) => {
  //if(req.headers&&req.headers.referer&&req.headers.referer.indexOf("sandbox.eth.build")>=0){
  console.log(" 🏷 sync ");

  let localProvider = new ethers.providers.JsonRpcProvider(localProviderUrl);

  localProvider.send("eth_syncing").then(
    (a, b) => {
      console.log("DONE", a, b, a.currentBlock);
      if (a === "false") {
        let currentBlock = ethers.BigNumber.from("" + a.currentBlock);
        console.log("currentBlock", currentBlock);
        res.send(
          "<html><body><div style='padding:20px;font-size:18px'><H1>SYNCING</H1></div><pre>" +
            JSON.stringify(a) +
            "</pre><div>currentBlock</div><b>" +
            currentBlock.toNumber() +
            "</b></body></html>"
        );
      } else {
        res.send(
          "<html><body><div style='padding:20px;font-size:18px'><H1 style=\"color:green;\">IN SYNC!</H1></div><pre></pre></body></html>"
        );
      }
    },
    (a, b) => {
      console.log("REJECT", a, b);
      res.send(
        "<html><body><div style='padding:20px;font-size:18px'><H1>SYNC REJECT</H1></div><pre></pre></body></html>"
      );
    }
  );

  //JSON.stringify(sortable)
});


app.get("/block", (req, res) => {
  //if(req.headers&&req.headers.referer&&req.headers.referer.indexOf("sandbox.eth.build")>=0){
  console.log(" 🛰 block ");

  let localProvider = new ethers.providers.JsonRpcProvider(localProviderUrl);

  localProvider.getBlockNumber().then(
    (a, b) => {
      console.log("DONE", a, b);
      res.send(
        "<html><body><div style='padding:20px;font-size:18px'><H1>BLOCK</H1></div><pre>" +
          a +
          "</pre></body></html>"
      );
    },
    (a, b) => {
      console.log("REJECT", a, b);
      res.send(
        "<html><body><div style='padding:20px;font-size:18px'><H1>BLOCK REJECT!!!!!!!</H1></div><pre>" +
          a +
          "</pre></body></html>"
      );
    }
  );

  //JSON.stringify(sortable)
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

app.get("/enodes", async (req, res) => {
  console.log("/ENODES", req.headers.referer);

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
  console.log("/PEERIDS", req.headers.referer);

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

https
  .createServer(
    {
      key: fs.readFileSync("server.key"),
      cert: fs.readFileSync("server.cert"),
    },
    app
  )
  .listen(48544, () => {
    console.log("Listening 48544...");
  });
