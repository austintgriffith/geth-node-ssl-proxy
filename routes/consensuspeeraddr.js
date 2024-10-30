const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/consensusPeerAddr", async (req, res) => {
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

module.exports = router;  