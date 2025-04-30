const { Telegraf } = require('telegraf');
const { handleCommands } = require('./commands');
const 
{ GameManager } = require('./gameManager');
require('dotenv').config();

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);
const gameManager = new GameManager(bot);
handleCommands(bot, gameManager);

// Запуск long-polling
bot.launch()
  .then(() => console.log('✅ Bot started (long-polling)'))
  .catch(console.error);

// Health-check сервер для Render
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('OK'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 Health-check listening on port ${port}`));