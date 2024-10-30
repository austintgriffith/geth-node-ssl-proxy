const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/peerids", async (req, res) => {
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

module.exports = router;