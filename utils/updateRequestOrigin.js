const { getDbPool } = require('./dbUtils');

async function updateRequestOrigin(reqHost) {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      // Upsert query to insert or update the request_host table
      const upsertQuery = `
        INSERT INTO request_host (host, n_requests)
        VALUES ($1, 1)
        ON CONFLICT (host)
        DO UPDATE SET n_requests = request_host.n_requests + 1
      `;
      await client.query(upsertQuery, [reqHost]);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error updating request_host:', err);
  }
}

module.exports = { updateRequestOrigin };