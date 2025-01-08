const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();
const readline = require('readline');

async function transferIpPointsForUser(OWNER, POINTS_TO_ADD) {
  console.log(`Preparing to add ${POINTS_TO_ADD} points to ${OWNER}...`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmation = await new Promise(resolve => {
    rl.question(`Are you sure you want to add ${POINTS_TO_ADD} points to ${OWNER}? (yes/no): `, answer => {
      resolve(answer.toLowerCase());
      rl.close();
    });
  });

  if (confirmation !== 'yes') {
    console.log('Operation cancelled.');
    return;
  }

  console.log("Proceeding with point addition...");

  let pool;
  try {
    pool = await getDbPool();
    const dbClient = await pool.connect();
    try {
      const updatePointsQuery = `
        INSERT INTO owner_points (owner, points)
        VALUES ($1, $2)
        ON CONFLICT (owner)
        DO UPDATE SET points = owner_points.points + $2;
      `;

      const result = await dbClient.query(updatePointsQuery, [OWNER, POINTS_TO_ADD]);
      console.log(`Successfully added ${POINTS_TO_ADD} points to ${OWNER}`);
      console.log(`Rows affected: ${result.rowCount}`);
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.error(`Error updating points for ${OWNER}:`, err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// transferIpPointsForUser('', 0);
