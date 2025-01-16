const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();

async function listNodeFailedChecks() {
  console.log("Listing node_failed_checks table...");

  let pool;
  try {
    pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM node_failed_checks ORDER BY n_failed_checks DESC');
      console.log("node_failed_checks table contents:");
      console.table(result.rows);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error listing node_failed_checks table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

listNodeFailedChecks().catch(err => {
  console.error("Unhandled error in listNodeFailedChecks:", err);
});
