const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();
const readline = require('readline');

async function createPointsTable() {
  console.log("Preparing to create/reset owner_points table...");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmation = await new Promise(resolve => {
    rl.question('Are you sure you want to create/reset the owner_points table? (yes/no): ', answer => {
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
        DROP TABLE IF EXISTS owner_points;
      `;

      const createTableQuery = `
        CREATE TABLE owner_points (
          owner VARCHAR(128) PRIMARY KEY,
          points BIGINT DEFAULT 0
        );
      `;

      // Drop the existing table
      await dbClient.query(dropTableQuery);
      console.log("Existing owner_points table dropped (if it existed)");

      // Create the new table
      await dbClient.query(createTableQuery);
      console.log("owner_points table created successfully with owner and points columns");
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.error('Error recreating owner_points table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

createPointsTable();