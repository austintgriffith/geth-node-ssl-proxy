const fs = require('fs');
const { fallbackRequestLogPath, cacheRequestLogPath, poolRequestLogPath } = require('../config');

function logRequest(req, startTime, utcTimestamp, duration, status, type) {
  const { method, params } = req.body;

  // Get request origin from headers
  let reqHost = req.get('Referer') || req.get('Origin') || req.get('host');
  try {
    const url = new URL(reqHost);
    reqHost = url.hostname;
  } catch (error) {
    reqHost = req.get('host').split(':')[0];
  }

  // Format status properly - if it's an object, stringify it, otherwise use as is
  let cleanStatus;
  if (typeof status === 'object' && status !== null) {
    cleanStatus = JSON.stringify(status);
  } else {
    cleanStatus = status ? status.toString().replace(/[\r\n\s]+/g, ' ').trim() : 'unknown';
  }

  let logEntry = `${utcTimestamp}|${startTime}|${reqHost}|${method}|`;
  
  if (params && Array.isArray(params)) {
    logEntry += params.map(param => {
      if (typeof param === 'object' && param !== null) {
        return JSON.stringify(param);
      }
      return param;
    }).join(',');
  }
  
  logEntry += `|${duration}|${cleanStatus}\n`;

  let logPath;
  if (type === 'fallback') {
    logPath = fallbackRequestLogPath;
  } else if (type === 'cache') {
    logPath = cacheRequestLogPath;
  } else if (type === 'pool') {
    logPath = poolRequestLogPath;
  }
  
  fs.appendFile(logPath, logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

module.exports = { logRequest };