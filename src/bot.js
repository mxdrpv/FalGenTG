const { Telegraf } = require('telegraf');
const { handleCommands } = require('./commands');
const { GameManager } = require('./gameManager');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const gameManager = new GameManager(bot);
handleCommands(bot, gameManager);
bot.launch();