const fs = require('fs');

const processMessageChecks = (pendingMessageChecks) => {
  // Get all message IDs from the map
  const messageIds = Array.from(pendingMessageChecks.keys());
  
  // Filter for check messages (ending with '_')
  const checkMessageIds = messageIds.filter(id => id.endsWith('_'));
  
  for (const checkMessageId of checkMessageIds) {
    // Get the corresponding main message ID by removing the '_'
    const mainMessageId = checkMessageId.slice(0, -1);
    
    // Get both messages from the map
    const checkMessage = pendingMessageChecks.get(checkMessageId);
    const mainMessage = pendingMessageChecks.get(mainMessageId);
    
    // Only process if we have both messages
    if (checkMessage && mainMessage) {
      // Compare response hashes
      const responsesMatch = checkMessage.responseHash === mainMessage.responseHash;
      
      // Log the comparison result to file
      const logMessage = `${mainMessageId}|${mainMessage.peerId}|${checkMessage.peerId}|${responsesMatch}\n`;
      fs.appendFileSync('rpcMessageChecks.log', logMessage);
      
      // Clean up processed messages
      pendingMessageChecks.delete(checkMessageId);
      pendingMessageChecks.delete(mainMessageId);
    }
  }
};

module.exports = { processMessageChecks }; 