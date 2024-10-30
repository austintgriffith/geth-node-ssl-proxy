const express = require('express');
const router = express.Router();

var methods = {};

router.get("/methods", (req, res) => {
  res.send(
    "<html><body><div style='padding:20px;font-size:18px'><H1>methods:</H1></div><pre>" +
      JSON.stringify(methods) +
      "</pre></body></html>"
  );
});

module.exports = router;