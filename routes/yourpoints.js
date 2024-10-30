const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/yourpoints", async (req, res) => {
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

module.exports = router;