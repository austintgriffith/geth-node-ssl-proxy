const express = require('express');
const router = express.Router();
const { targetUrl } = require('../config');

router.get("/proxyurl", (req, res) => {
  res.send(
    "<html><body><div style='padding:20px;font-size:18px'><H1>PROXY TO:</H1></div><pre>" +
      targetUrl +
      "</pre></body></html>"
  );
});

module.exports = router;