const fs = require('fs');
const { performance } = require('perf_hooks');

function logRpcRequest(req, messageId, requestStartTimes) {
  const { method, params } = req.body;
  const startTime = requestStartTimes.get(messageId);
  const endTime = performance.now();
  const duration = endTime - startTime;

  let logEntry = `${method}|`;
  
  if (params && Array.isArray(params)) {
    logEntry += params.map(param => {
      if (typeof param === 'object' && param !== null) {
        return JSON.stringify(param);
      }
      return param;
    }).join(',');
  }
  
  logEntry += `|${duration.toFixed(3)}\n`;
  
  fs.appendFile('rpcRequests.log', logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });

  // Clean up the start time
  requestStartTimes.delete(messageId);
}

module.exports = { logRpcRequest };