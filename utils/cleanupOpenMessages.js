function cleanupOpenMessages(openMessages, messageCleanupInterval) {
  const now = Date.now();
  for (const [id, message] of openMessages) {
    if (now - message.timestamp > messageCleanupInterval) { // 1 minute timeout
      console.log(`Removing timed out message: ${id}`);
      message.res.status(504).json({
        jsonrpc: "2.0",
        id: id,
        error: {
          code: -32603,
          message: "Gateway Timeout",
          data: "No response received from the node"
        }
      });
      openMessages.delete(id);
    }
  }
}

module.exports = { cleanupOpenMessages };