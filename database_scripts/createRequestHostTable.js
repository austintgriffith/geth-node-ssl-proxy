const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();
const readline = require('readline');

async function createRequestHostTable() {
  console.log("Preparing to create/reset request_host table...");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmation = await new Promise(resolve => {
    rl.question('Are you sure you want to create/reset the request_host table? (yes/no): ', answer => {
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
        DROP TABLE IF EXISTS request_host;
      `;

      const createTableQuery = `
        CREATE TABLE request_host (
          host VARCHAR(255) PRIMARY KEY,
          n_requests INTEGER DEFAULT 0
        );
      `;

      // Drop the existing table
      await dbClient.query(dropTableQuery);
      console.log("Existing request_host table dropped (if it existed)");

      // Create the new table
      await dbClient.query(createTableQuery);
      console.log("request_host table created successfully with host and n_requests columns");
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.error('Error recreating request_host table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

createRequestHostTable();

