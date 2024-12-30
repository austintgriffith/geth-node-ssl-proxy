const { getDbPool } = require('../utils/dbUtils');

async function incrementOwnerPoints(owner) {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO owner_points (owner, points)
        VALUES ($1, 10)
        ON CONFLICT (owner)
        DO UPDATE SET points = owner_points.points + 10
      `, [owner]);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error incrementing owner points:', err);
  }
}

module.exports = { incrementOwnerPoints };