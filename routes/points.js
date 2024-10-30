const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/points", async (req, res) => {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      // Query for all entries in the owner_points table
      const result = await client.query(`
        SELECT owner, points
        FROM owner_points
        ORDER BY points DESC
      `);

      // console.log(`Total records found: ${result.rows.length}`);

      let tableRows = result.rows.map(row => `
        <tr>
          <td>${row.owner}</td>
          <td>${row.points}</td>
        </tr>
      `).join('');

      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>OWNER POINTS</h1>
              <p>Total records: ${result.rows.length}</p>
              <table border="1" cellpadding="5">
                <tr>
                  <th>Owner</th>
                  <th>Points</th>
                </tr>
                ${tableRows}
              </table>
            </div>
          </body>
        </html>
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error retrieving owner points:', err);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <h1>ERROR RETRIEVING OWNER POINTS</h1>
            <p>An error occurred while trying to retrieve owner points from the database.</p>
            <p>Error details: ${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

module.exports = router;