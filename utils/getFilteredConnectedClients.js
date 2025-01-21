const { getDbPool } = require('./dbUtils');

// Helper function to compare block numbers as strings
function compareBlockNumbers(a, b) {
  // Convert both to strings and pad with zeros to ensure proper string comparison
  const aStr = a.toString().padStart(20, '0');
  const bStr = b.toString().padStart(20, '0');
  return aStr.localeCompare(bStr);
}

async function getFilteredConnectedClients(connectedClients, targetBlockNumber = null) {
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
      const largestBlockNumber = result.rows.reduce((max, row) => {
        return compareBlockNumbers(row.block_number, max) > 0 ? row.block_number : max;
      }, '0');

      console.log("🔭 largest block number:", largestBlockNumber.toString());

      // Filter rows based on block number requirement
      const filteredRows = targetBlockNumber !== null
        // For check requests: include nodes at or above target block
        ? result.rows.filter(row => {
            try {
              const isValid = compareBlockNumbers(row.block_number, targetBlockNumber) >= 0;
              if (!isValid) {
                console.log(`Filtering out node ${row.socket_id} at block ${row.block_number} (target: ${targetBlockNumber})`);
              }
              return isValid;
            } catch (error) {
              console.error('Error comparing block numbers:', error, {
                rowBlockNumber: row.block_number,
                targetBlockNumber
              });
              return false;
            }
          })
        // For main requests: only include nodes at the latest block
        : result.rows.filter(row => {
            try {
              const isValid = compareBlockNumbers(row.block_number, largestBlockNumber) === 0;
              if (!isValid) {
                console.log(`Filtering out node ${row.socket_id} at block ${row.block_number} (not at latest: ${largestBlockNumber})`);
              }
              return isValid;
            } catch (error) {
              console.error('Error comparing to latest block:', error, {
                rowBlockNumber: row.block_number,
                largestBlockNumber
              });
              return false;
            }
          });

      // Create a Map of filtered clients
      const filteredClients = new Map();
      filteredRows.forEach(row => {
        if (row.socket_id) {
          const matchingClient = Array.from(connectedClients).find(client => {
            return client.clientID === row.socket_id;
          });
          if (matchingClient) {
            filteredClients.set(row.socket_id, {
              ...matchingClient, 
              nodeStatusId: row.id,
              blockNumber: row.block_number.toString()
            });
          }
        }
      });

      if (targetBlockNumber !== null) {
        console.log(`👥 Total active clients: ${result.rows.length}`);
        console.log(`🔌 Clients at or above block ${targetBlockNumber}: ${filteredClients.size}`);
      } else {
        console.log(`👥 Total active clients: ${result.rows.length}`);
        console.log(`🔌 Clients at latest block ${largestBlockNumber}: ${filteredClients.size}`);
      }

      // Return as an array to properly handle both values
      return [filteredClients, largestBlockNumber];
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in getFilteredConnectedClients:', error);
    // Return empty Map and 0 in case of error
    return [new Map(), '0'];
  }
}

module.exports = { getFilteredConnectedClients };