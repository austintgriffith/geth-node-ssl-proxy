const TelegramBot = require("node-telegram-bot-api");
const { ignoredErrorCodes } = require('../../shared/ignoredErrorCodes');

require("dotenv").config();

let telegramBot = null;
let TELEGRAM_CHAT_IDS = [];
let isConfigured = false;

// Initialize telegram configuration with error handling
try {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = process.env.TELEGRAM_CHAT_IDS;
  
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN not found in environment variables. Telegram alerts will be disabled.");
  } else if (!chatIds) {
    console.warn("⚠️ TELEGRAM_CHAT_IDS not found in environment variables. Telegram alerts will be disabled.");
  } else {
    TELEGRAM_CHAT_IDS = chatIds.split(",").map((id) => id.trim()).filter(id => id.length > 0);
    
    if (TELEGRAM_CHAT_IDS.length === 0) {
      console.warn("⚠️ No valid chat IDs found in TELEGRAM_CHAT_IDS. Telegram alerts will be disabled.");
    } else {
      telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
      isConfigured = true;
      console.log(`✅ Telegram bot configured with ${TELEGRAM_CHAT_IDS.length} chat ID(s)`);
    }
  }
} catch (error) {
  console.error("❌ Error initializing Telegram bot:", error.message);
  console.warn("⚠️ Telegram alerts will be disabled due to initialization error.");
}

function sendTelegramAlert(message, errorCode) {
  try {
    // Check if telegram is properly configured
    if (!isConfigured || !telegramBot || TELEGRAM_CHAT_IDS.length === 0) {
      console.log("🚫 Telegram not configured, skipping alert");
      return;
    }

    // Check if error code should be ignored
    if (typeof errorCode !== 'undefined' && ignoredErrorCodes.includes(errorCode)) {
      console.log(`🚫 Not sending Telegram alert for ignored error code: ${errorCode}`);
      return;
    }

    // Validate message
    if (!message || typeof message !== 'string') {
      console.warn("⚠️ Invalid message provided to sendTelegramAlert, skipping");
      return;
    }

    // Send to all configured chat IDs
    TELEGRAM_CHAT_IDS.forEach((chatId) => {
      try {
        telegramBot
          .sendMessage(chatId, message)
          .then(() => console.log(`✅ Telegram alert sent to ${chatId}`))
          .catch((err) => {
            console.error(`❌ Telegram alert error for ${chatId}:`, err.message);
          });
      } catch (syncError) {
        console.error(`❌ Synchronous error sending telegram to ${chatId}:`, syncError.message);
      }
    });
  } catch (error) {
    console.error("❌ Critical error in sendTelegramAlert:", error.message);
    // Don't rethrow - we never want telegram issues to crash the main process
  }
}

module.exports = {
  sendTelegramAlert
}; 