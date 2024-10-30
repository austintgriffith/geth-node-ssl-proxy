const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/enodes", async (req, res) => {
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

module.exports = router;