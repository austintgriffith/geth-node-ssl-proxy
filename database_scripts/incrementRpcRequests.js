const { getDbPool } = require('../utils/dbUtils');

async function incrementRpcRequests(clientID) {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      await client.query(`
        UPDATE node_status
        SET n_rpc_requests = COALESCE(n_rpc_requests, 0) + 1
        WHERE socket_id = $1
      `, [clientID]);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error incrementing n_rpc_requests:', err);
  }
}

module.exports = { incrementRpcRequests };