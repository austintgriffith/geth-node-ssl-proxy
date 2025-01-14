const { getDbPool } = require('../utils/dbUtils');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function promptUser() {
  return new Promise((resolve) => {
    rl.question('Are you sure you want to reset the node_status table? This action cannot be undone. (yes/no): ', (answer) => {
      resolve(answer.toLowerCase());
      rl.close();
    });
  });
}

async function resetNodeStatusTable() {
  const answer = await promptUser();

  if (answer !== 'yes') {
    console.log('Operation cancelled.');
    return;
  }

  console.log("Resetting node_status table...");

  let pool;
  let client;

  try {
    pool = await getDbPool();
    client = await pool.connect();
    
    try {
      const truncateQuery = `TRUNCATE TABLE node_status;`;
      await client.query(truncateQuery);
      console.log("node_status table has been cleared successfully");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error resetting node_status table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

resetNodeStatusTable();