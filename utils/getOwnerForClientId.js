const { getDbPool } = require('./dbUtils');

async function getOwnerForClientId(clientId) {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT owner
        FROM node_status
        WHERE socket_id = $1
      `, [clientId]);
      
      if (result.rows.length > 0) {
        return { owner: result.rows[0].owner };
      } else {
        return null;
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error getting owner for client ID:', err);
    return null;
  }
}

module.exports = { getOwnerForClientId };