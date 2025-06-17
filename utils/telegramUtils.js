const TelegramBot = require("node-telegram-bot-api");
const { ignoredErrorCodes } = require('../../shared/ignoredErrorCodes');

require("dotenv").config();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS
  ? process.env.TELEGRAM_CHAT_IDS.split(",").map((id) => id.trim())
  : [];
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

function sendTelegramAlert(message, errorCode) {
  if (typeof errorCode !== 'undefined' && ignoredErrorCodes.includes(errorCode)) {
    console.log(`🚫 Not sending Telegram alert for ignored error code: ${errorCode}`);
    return;
  }
  TELEGRAM_CHAT_IDS.forEach((chatId) => {
    telegramBot
      .sendMessage(chatId, message)
      .then(() => console.log(`Telegram alert sent to ${chatId}!`))
      .catch((err) =>
        console.error(`Telegram alert error for ${chatId}:`, err)
      );
  });
}

module.exports = {
  sendTelegramAlert
}; 