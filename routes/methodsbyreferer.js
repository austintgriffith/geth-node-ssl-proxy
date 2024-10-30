const express = require('express');
const router = express.Router();

var methodsByReferer = {};

router.get("/methodsByReferer", (req, res) => {
  res.send(
    "<html><body><div style='padding:20px;font-size:18px'><H1>methods by referer:</H1></div><pre>" +
      JSON.stringify(methodsByReferer) +
      "</pre></body></html>"
  );
});

module.exports = router;