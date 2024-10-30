const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/active", async (req, res) => {
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

module.exports = router;