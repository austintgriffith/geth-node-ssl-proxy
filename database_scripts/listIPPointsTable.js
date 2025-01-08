const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();

async function listPointsTable() {
  console.log("Listing ip_points table...");

  let pool;
  try {
    pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT ip_address, points::bigint FROM ip_points ORDER BY points DESC');
      console.log("ip_points table contents:");
      console.table(result.rows.map(row => ({
        ip_address: row.ip_address,
        points: BigInt(row.points) // Ensure it's treated as a BigInt in JavaScript
      })));
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error listing ip_points table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

listPointsTable();