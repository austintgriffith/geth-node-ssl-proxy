const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();

async function createTables() {
  console.log("About to create node_failed_checks table...");
  
  // Ask for user confirmation
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    readline.question('Do you want to proceed with creating the node_failed_checks table? (y/n) ', resolve);
  });
  
  readline.close();

  if (answer.toLowerCase() !== 'y') {
    console.log('Table creation cancelled');
    return;
  }

  let pool;
  let client;

  try {
    pool = await getDbPool();
    client = await pool.connect();
    
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS node_failed_checks (
        node_id VARCHAR(255) PRIMARY KEY,
        n_failed_checks INTEGER DEFAULT 0
      );
    `;

    await client.query(createTableQuery);
    console.log('Successfully created node_failed_checks table');
  } catch (error) {
    console.error('Error creating table:', error);
    throw error;
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  createTables()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
