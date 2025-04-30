const { Telegraf } = require('telegraf');
const { handleCommands } = require('./commands');
const { GameManager } = require('./gameManager');
const express = require('express');
require('dotenv').config();

const TOKEN = process.env.BOT_TOKEN;
const DOMAIN = process.env.DOMAIN; // e.g. https://your-app.onrender.com
const PORT = process.env.PORT || 3000;

// Инициализация бота
const bot = new Telegraf(TOKEN);
const gameManager = new GameManager(bot);
handleCommands(bot, gameManager);

// Webhook setup вместо long-polling
const app = express();

// Обработка запросов от Telegram
app.use(bot.webhookCallback(`/bot${TOKEN}`));

// Health-check для Render
app.get('/', (req, res) => res.send('Bot is running'));

// Устанавливаем вебхук в Telegram
(async () => {
  try {
    await bot.telegram.setWebhook(`${DOMAIN}/bot${TOKEN}`);
    console.log(`Webhook set to ${DOMAIN}/bot${TOKEN}`);
  } catch (err) {
    console.error('Error setting webhook:', err);
  }
})();

// Запуск HTTP-сервера
app.listen(PORT, () => console.log(`Express server listening on ${PORT}`));
