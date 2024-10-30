const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/checkin", async (req, res) => {
  let logMessages = [];

  console.log(`/CHECKIN ${req.headers.referer}`);
  console.log(`Request query parameters: ${JSON.stringify(req.query)}`);

  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    console.log('🚀 🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
    console.log('        HTTP CHECKIN          ');
    console.log('🚀 🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
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

module.exports = router;