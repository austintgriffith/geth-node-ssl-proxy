const { getDbPool } = require('../utils/dbUtils');
require('dotenv').config();

async function displayTableContents() {
  console.log("Displaying ip_points and node_status table contents...");

  let pool;
  try {
    pool = await getDbPool();

    // Query ip_points table
    const ipPointsQuery = `
      SELECT ip_address, points::bigint
      FROM ip_points
      ORDER BY points DESC;
    `;
    const ipPointsResult = await pool.query(ipPointsQuery);

    console.log("\nip_points table contents:");
    console.table(ipPointsResult.rows.map(row => ({
      ip_address: row.ip_address,
      points: BigInt(row.points)
    })));

    // Query node_status table
    const nodeStatusQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'node_status';
    `;
    const columnResult = await pool.query(nodeStatusQuery);
    const columns = columnResult.rows.map(row => row.column_name);

    const nodeStatusQuery2 = `
      SELECT ${columns.join(', ')}
      FROM node_status
      ORDER BY last_checkin DESC;
    `;
    const nodeStatusResult = await pool.query(nodeStatusQuery2);

    console.log("\nnode_status table contents:");
    console.table(nodeStatusResult.rows);

  } catch (err) {
    console.error('Error displaying table contents:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

displayTableContents();