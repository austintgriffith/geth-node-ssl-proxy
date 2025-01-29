const fs = require('fs');
const { fallbackRequestLogPath } = require('../config');

function logFallbackRequest(req, startTime, utcTimestamp, duration, status) {
  const { method, params } = req.body;

  // Get request origin from headers
  let reqHost = req.get('Referer') || req.get('Origin') || req.get('host');
  try {
    const url = new URL(reqHost);
    reqHost = url.hostname;
  } catch (error) {
    reqHost = req.get('host').split(':')[0];
  }

  // Sanitize status by removing any newlines and extra whitespace
  const cleanStatus = status ? status.toString().replace(/[\r\n\s]+/g, ' ').trim() : 'unknown';

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
  
  fs.appendFile(fallbackRequestLogPath, logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

module.exports = { logFallbackRequest };