const express = require('express');
const router = express.Router();
const publicClient = require('../utils/publicClient.js');

router.get("/sync", async (req, res) => {
  console.log(" 🏷 sync ");

  try {
    const syncStatus = await publicClient.request({ method: 'eth_syncing' });
    
    if (syncStatus === false) {
      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <H1 style="color:green;">IN SYNC!</H1>
            </div>
          </body>
        </html>
      `);
    } else {
      const currentBlock = BigInt(syncStatus.currentBlock);
      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <H1>SYNCING</H1>
            </div>
            <pre>${JSON.stringify(syncStatus, null, 2)}</pre>
            <div>currentBlock</div>
            <b>${currentBlock.toString()}</b>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error("SYNC ERROR", error);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <H1>SYNC ERROR</H1>
          </div>
          <pre>${error.message}</pre>
        </body>
      </html>
    `);
  }
});

module.exports = router;