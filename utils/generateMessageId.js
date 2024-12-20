const crypto = require('crypto');

function generateMessageId(message, clientIp) {
  const hash = crypto.createHash('sha256');
  const timestamp = Date.now();
  hash.update(JSON.stringify(message) + clientIp + timestamp);
  return hash.digest('hex');
}

module.exports = { generateMessageId };