const { getDbPool } = require('./dbUtils');

async function getFilteredConnectedClients(connectedClients) {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const minutes = 5; // Default to 5 minutes
      const result = await client.query(`
        SELECT id, block_number, last_checkin, socket_id
        FROM node_status
        WHERE last_checkin > NOW() - INTERVAL '${minutes} minutes'
        ORDER BY block_number DESC
      `);
      
      // Find the largest block number
      const largestBlockNumber = result.rows.reduce((max, row) => 
        row.block_number > max ? row.block_number : max, 0);

      console.log("🔭 largest block number:", largestBlockNumber.toString());

      // Filter rows with the largest block number
      const filteredRows = result.rows.filter(row => row.block_number === largestBlockNumber);

      // Create a Map of filtered clients
      const filteredClients = new Map();
      filteredRows.forEach(row => {
        if (row.socket_id) {
          const matchingClient = Array.from(connectedClients).find(client => {
            return client.clientID === row.socket_id;
          });
          if (matchingClient) {
            filteredClients.set(row.socket_id, {...matchingClient, nodeStatusId: row.id});
          }
        }
      });

      console.log(`👥 Total active clients: ${result.rows.length}`);
      console.log(`🔌 Clients at latest block ${largestBlockNumber}: ${filteredClients.size}`);

      return filteredClients;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error in getFilteredConnectedClients:', err);
    return new Map(); // Return an empty Map in case of error
  }
}

module.exports = { getFilteredConnectedClients };