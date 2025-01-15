// Message stores
const openMessages = new Map();
const requestStartTimes = new Map();
const pendingMessageChecks = new Map();

module.exports = {
  openMessages,
  requestStartTimes,
  pendingMessageChecks
};