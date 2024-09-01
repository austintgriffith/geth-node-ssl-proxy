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
const WebSocket = require('ws');
const { forEach } = require("ssl-root-cas");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require('pg');
const createRoute = require('./create');


// Create a WebSocket server listening on all network interfaces on port 8080
const wss = new WebSocket.Server({ port: 8080, host: '0.0.0.0' });

let connectedClients = [];

console.log('WebSocket server started on ws://0.0.0.0:8080');

wss.on('connection', function connection(ws, req) {
  const ip = req.socket.remoteAddress;
  console.log('Client connected',ip);

  connectedClients.push({
    ws: ws,
    ip: ip,
    machineInfo:{},
  })

  ws.on('close', function close() {
    console.log('Client disconnected');
    connectedClients = connectedClients.filter(client => client.ws !== ws);  // Remove the client from the list on disconnect
  });

  ws.on('message', function incoming(message) {
    console.log('Received:', message);

    //find the connectedClient that matches ws 
    const client = connectedClients.find(client => client.ws === ws);
    if (client) {
      client.machineInfo = JSON.parse(message);
    }

  });
});



/*
// Function to ask a random client for the time
function askRandomClientForTime() {
  console.log("# of CLIENTS:",connectedClients.length)
  if (connectedClients.length > 0) {
    forEach(connectedClients, function (client) {
      console.log("ASKING CLIENT",client.id)
      client.send('Give me some info about your node?');
    });
  } else {
    console.log('No clients connected');
  }
}

// Periodically ask a random client for the current time
setInterval(askRandomClientForTime, 15000);  // Ask every client about their machine
*/

app.get("/clients", (req, res) => {
  //if(req.headers&&req.headers.referer&&req.headers.referer.indexOf("sandbox.eth.build")>=0){
  console.log(" 🧑‍💻 clients ",connectedClients.length);

  let clientDisplay = connectedClients.map(client => {
    return "<div style='padding:10px;font-size:18px'> "+client.ip+" <pre>"+JSON.stringify(client.machineInfo)+"</pre></div>"
  }).join("")


  res.send(
    "<html><body><div style='padding:20px;font-size:18px'><H1>CLIENTS</H1></div><pre>" +
    connectedClients.length +
      "</pre>"+clientDisplay+"</body></html>"
  );
   
  //JSON.stringify(sortable)
});




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

async function initializeDbConnection() {
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

    const dbConfig = {
      host: 'bgclientdb.cluster-cjoo0gi8an8c.us-east-1.rds.amazonaws.com',
      user: secret.username,
      password: secret.password,
      database: secret.dbname || 'postgres',
      port: 5432,
      ssl: true
    };

    pool = new Pool(dbConfig);
    console.log("Database connection initialized");
  } catch (error) {
    console.error("Error initializing database connection:", error);
  }
}

initializeDbConnection();

app.locals.pool = pool;

app.get("/create", createRoute);

app.get("/checkin", async (req, res) => {
  console.log("/CHECKIN", req.headers.referer);

  if (!pool) {
    return res.status(500).send("Database connection not initialized");
  }

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
    peer_count
  } = req.query;

  // Get the client's IP address
  const ip_address = req.ip || req.connection.remoteAddress;

  // Validate required fields
  if (!id) {
    return res.status(400).send("Missing required parameter: id");
  }

  // Convert numeric fields and provide default values
  const parsedCpuUsage = parseFloat(cpu_usage) || null;
  const parsedMemoryUsage = parseFloat(memory_usage) || null;
  const parsedStorageUsage = parseFloat(storage_usage) || null;
  const parsedBlockNumber = block_number ? BigInt(block_number) : null;
  const parsedPeerCount = parseInt(peer_count) || null;

  const upsertQuery = `
    INSERT INTO node_status (
      id, node_version, execution_client, consensus_client, 
      cpu_usage, memory_usage, storage_usage, block_number, block_hash, last_checkin, ip_address, peer_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, $11)
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
      peer_count = EXCLUDED.peer_count;
  `;

  try {
    const client = await pool.connect();
    try {
      await client.query(upsertQuery, [
        id, node_version, execution_client, consensus_client,
        parsedCpuUsage, parsedMemoryUsage, parsedStorageUsage, parsedBlockNumber, block_hash, ip_address, parsedPeerCount
      ]);
      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>CHECKIN SUCCESSFUL</h1>
              <p>Node status updated for ID: ${id}</p>
              <p>IP Address: ${ip_address}</p>
            </div>
          </body>
        </html>
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error updating node status:', err);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <h1>CHECKIN FAILED</h1>
            <p>An error occurred while trying to update the node status.</p>
            <p>Error: ${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

app.get("/active", async (req, res) => {
  console.log("/ACTIVE", req.headers.referer);

  if (!pool) {
    return res.status(500).send("Database connection not initialized");
  }

  const minutes = parseInt(req.query.minutes) || 5; // Default to 5 minutes if not specified

  const query = `
    SELECT * FROM node_status
    WHERE last_checkin > NOW() - INTERVAL '${minutes} minutes'
    ORDER BY last_checkin DESC;
  `;

  try {
    const client = await pool.connect();
    try {
      const result = await client.query(query);
      const activeNodes = result.rows;

      let tableRows = activeNodes.map(node => `
        <tr>
          <td>${node.id}</td>
          <td>${node.node_version}</td>
          <td>${node.execution_client}</td>
          <td>${node.consensus_client}</td>
          <td>${node.cpu_usage}</td>
          <td>${node.memory_usage}</td>
          <td>${node.storage_usage}</td>
          <td>${node.block_number}</td>
          <td>${node.block_hash}</td>
          <td>${node.last_checkin}</td>
          <td>${node.ip_address}</td>
          <td>${node.peer_count !== null ? node.peer_count : 'N/A'}</td>
        </tr>
      `).join('');

      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>ACTIVE NODES (Last ${minutes} minutes)</h1>
              <table border="1">
                <tr>
                  <th>ID</th>
                  <th>Version</th>
                  <th>Execution Client</th>
                  <th>Consensus Client</th>
                  <th>CPU Usage</th>
                  <th>Memory Usage</th>
                  <th>Storage Usage</th>
                  <th>Block Number</th>
                  <th>Block Hash</th>
                  <th>Last Check-in</th>
                  <th>IP Address</th>
                  <th>Peer Count</th>
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
            <p>An error occurred while trying to retrieve active nodes.</p>
            <p>Error: ${err.message}</p>
          </div>
        </body>
      </html>
    `);
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
        "<html><body><div style='padding:20px;font-size:18px'><H1>BLOCK REJECT</H1></div><pre>" +
          a +
          "</pre></body></html>"
      );
    }
  );

  //JSON.stringify(sortable)
});

app.get("/time", async (req, res) => {
  console.log("/TIME", req.headers.referer);

  if (!pool) {
    return res.status(500).send("Database connection not initialized");
  }

  try {
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
