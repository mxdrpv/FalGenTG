const { Telegraf } = require('telegraf');
const { handleCommands } = require('./commands');
const { GameManager } = require('./gameManager');
const express = require('express');
require('dotenv').config();

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);
const gameManager = new GameManager(bot);
handleCommands(bot, gameManager);

// Запуск бота (long polling)
bot.launch()
  .then(() => console.log('✅ Bot started'))
  .catch(console.error);

// HTTP‑сервер для Render
const app = express();
app.get('/', (req, res) => res.send('Bot is running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 Express server listening on port ${port}`));
