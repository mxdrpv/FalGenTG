const { Markup } = require('telegraf');

exports.handleCommands = (bot, gameManager) => {
  bot.command('start_liar', ctx => gameManager.initLobby(ctx.chat.id));

  bot.action('join', async ctx => {
    await gameManager.addPlayer(ctx.from, ctx.chat.id);
    await ctx.answerCbQuery(`✅ ${ctx.from.first_name} присоединился`);
    await gameManager.updateLobby(ctx.chat.id);
  });

  bot.action('leave', async ctx => {
    await gameManager.removePlayer(ctx.from, ctx.chat.id);
    await ctx.answerCbQuery(`❌ ${ctx.from.first_name} вышел`);
    await gameManager.updateLobby(ctx.chat.id);
  });

  bot.action('start_game', async ctx => {
    await ctx.answerCbQuery();
    await gameManager.startGame(ctx.chat.id);
  });

  bot.action(/vote_(\d+)/, async ctx => {
    await ctx.answerCbQuery('🗳️ Голос засчитан');
    await gameManager.recordVote(ctx.from.id, ctx.match[1], ctx.chat.id);
  });

  bot.on('text', async ctx => {
    if (ctx.chat.type !== 'private') return;
    const handled = await gameManager.recordAnswer(ctx.from.id, ctx.message.text);
    if (handled) await ctx.reply('✅ Ответ принят! Жди голосования.');
  });
};
