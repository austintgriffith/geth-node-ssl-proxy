const { getDbPool } = require('./dbUtils');

async function checkForFallback() {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const minutes = 5; // Set to 5 minutes
      const result = await client.query(`
        SELECT id, block_number
        FROM node_status
        WHERE last_checkin > NOW() - INTERVAL '${minutes} minutes'
        ORDER BY block_number DESC
      `);

    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error checking for fallback:', err);
  }
}

module.exports = { checkForFallback };