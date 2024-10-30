const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/IPLOCATIONS", async (req, res) => {
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

module.exports = router;