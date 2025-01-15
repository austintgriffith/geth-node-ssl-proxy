// Message stores
const openMessages = new Map();
const requestStartTimes = new Map();

const openMessagesCheck = new Map();
const requestStartTimesCheck = new Map();

const openMessagesCheckB = new Map();
const requestStartTimesCheckB = new Map();

const pendingMessageChecks = new Map();

module.exports = {
  openMessages,
  requestStartTimes,
  openMessagesCheck,
  requestStartTimesCheck,
  openMessagesCheckB,
  requestStartTimesCheckB,
  pendingMessageChecks
};