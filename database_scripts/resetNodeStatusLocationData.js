const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();

async function resetNodeStatusLocationData() {
  console.log("Resetting location data in node_status table...");

  let pool;
  try {
    pool = await getDbPool();
    const client = await pool.connect();
    try {
      const resetQuery = `
        UPDATE node_status
        SET country = NULL,
            country_code = NULL,
            region = NULL,
            city = NULL,
            lat = NULL,
            lon = NULL,
            ip_loc_lookup_epoch = NULL,
            continent = NULL;
      `;

      await client.query(resetQuery);
      console.log("Location data in node_status table has been reset to NULL.");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error resetting location data in node_status table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

resetNodeStatusLocationData();
