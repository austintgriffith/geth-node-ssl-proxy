const express = require('express');
const router = express.Router();
const publicClient = require('../utils/publicClient.js');

router.get("/block", async (req, res) => {
  console.log(" 🛰 block ");

  try {
    const blockNumber = await publicClient.getBlockNumber();
    res.send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <H1>BLOCK</H1>
          </div>
          <pre>${blockNumber}</pre>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("BLOCK ERROR", error);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <H1>BLOCK ERROR</H1>
          </div>
          <pre>${error.message}</pre>
        </body>
      </html>
    `);
  }
});

module.exports = router;