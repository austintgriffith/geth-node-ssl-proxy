const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();

async function listPointsTable() {
  console.log("Listing owner_points table...");

  let pool;
  try {
    pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT owner, points::bigint FROM owner_points ORDER BY points DESC');
      console.log("owner_points table contents:");
      console.table(result.rows.map(row => ({
        owner: row.owner,
        points: BigInt(row.points) // Ensure it's treated as a BigInt in JavaScript
      })));
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error listing owner_points table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

listPointsTable();