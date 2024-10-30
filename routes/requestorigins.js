const express = require('express');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get("/requestorigins", async (req, res) => {
  try {
    const pool = await getDbPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT host, n_requests
        FROM request_host
        ORDER BY n_requests DESC
      `);

      let tableRows = result.rows.map(row => `
        <tr>
          <td><a href="http://${row.host}" target="_blank">${row.host}</a></td>
          <td>${row.n_requests}</td>
        </tr>
      `).join('');

      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>REQUEST ORIGINS</h1>
              <p>Total unique hosts: ${result.rows.length}</p>
              <table border="1" cellpadding="5">
                <tr>
                  <th>Origin</th>
                  <th>Number of Requests</th>
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
    console.error('Error retrieving request hosts:', err);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <h1>ERROR RETRIEVING REQUEST HOSTS</h1>
            <p>An error occurred while trying to retrieve request hosts from the database.</p>
            <p>Error details: ${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

module.exports = router;