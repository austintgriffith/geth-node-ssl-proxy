const { getDbPool } = require('../utils/dbUtils');
const readline = require('readline');
require('dotenv').config();

async function createPointsTable() {
  console.log("Preparing to create/reset ip_points table...");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmation = await new Promise(resolve => {
    rl.question('Are you sure you want to create/reset the ip_points table? (yes/no): ', answer => {
      resolve(answer.toLowerCase());
      rl.close();
    });
  });

  if (confirmation !== 'yes') {
    console.log('Operation cancelled.');
    return;
  }

  console.log("Proceeding with table creation/reset...");

  let pool;
  try {
    pool = await getDbPool();
    const dbClient = await pool.connect();
    try {
      const dropTableQuery = `
        DROP TABLE IF EXISTS ip_points;
      `;

      const createTableQuery = `
        CREATE TABLE ip_points (
          ip_address VARCHAR(45) PRIMARY KEY,
          points BIGINT DEFAULT 0
        );
      `;

      // Drop the existing table
      await dbClient.query(dropTableQuery);
      console.log("Existing ip_points table dropped (if it existed)");

      // Create the new table
      await dbClient.query(createTableQuery);
      console.log("ip_points table created successfully with BIGINT points column");
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.error('Error recreating ip_points table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

createPointsTable();