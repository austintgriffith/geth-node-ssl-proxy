const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();

async function listNodeStatus() {
  console.log("Listing node_status table...");

  let pool;
  try {
    console.log("Creating database connection pool...");
    pool = await getDbPool();

    console.log("Connecting to database...");
    const client = await pool.connect();
    try {
      console.log("Executing query...");
      const result = await client.query('SELECT * FROM node_status');
      console.log("node_status table contents:");
      console.table(result.rows);
    } finally {
      console.log("Releasing database client...");
      client.release();
    }
  } catch (err) {
    console.error('Error listing node_status table:', err);
  } finally {
    if (pool) {
      console.log("Ending database pool...");
      await pool.end();
    }
  }
}

listNodeStatus().catch(err => {
  console.error("Unhandled error in listNodeStatus:", err);
});