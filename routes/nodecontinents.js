const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/nodecontinents", async (req, res) => {
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

module.exports = router;