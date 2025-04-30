const { Markup } = require('telegraf');
const { randomItem, questions } = require('./utils');

class GameManager {
  constructor(bot) {
    this.bot = bot;
    this.games = new Map();
    this.maxRounds = 3;
  }

  getGame(chatId) {
    if (!this.games.has(chatId)) {
      this.games.set(chatId, {
        players: [], scores: {}, lobbyMessageId: null,
        round: 0, currentLiar: null,
        state: 'lobby', answers: {}, votes: {}, honestQ: null,
        voterMessageId: null, resultMessageId: null
      });
    }
    return this.games.get(chatId);
  }

  async initLobby(chatId) {
    const g = this.getGame(chatId);
    g.state = 'lobby';
    const names = g.players.map(p => p.name).join(', ') || '—';
    const text = `🎲 Лобби «Лживый Гений»\nИгроки (${g.players.length}): ${names}`;
    const buttons = [
      Markup.button.callback('▶️ Вступить', 'join'),
      Markup.button.callback('⏹️ Выйти', 'leave')
    ];
    if (g.players.length >= 3) buttons.push(Markup.button.callback('🚀 Начать игру', 'start_game'));
    const opts = { reply_markup: { inline_keyboard: [buttons] } };
    if (g.lobbyMessageId) {
      try { await this.bot.telegram.editMessageText(chatId, g.lobbyMessageId, null, text, opts); } catch {};
    } else {
      const msg = await this.bot.telegram.sendMessage(chatId, text, opts);
      g.lobbyMessageId = msg.message_id;
    }
  }

  async addPlayer(user, chatId) {
    const g = this.getGame(chatId);
    if (g.state !== 'lobby') return;
    if (!g.players.some(p => p.id === user.id) && g.players.length < 10) {
      g.players.push({ id: user.id, name: user.first_name });
      g.scores[user.id] = 0;
    }
  }

  async removePlayer(user, chatId) {
    const g = this.getGame(chatId);
    if (g.state !== 'lobby') return;
    g.players = g.players.filter(p => p.id !== user.id);
    delete g.scores[user.id];
  }

  async updateLobby(chatId) { return this.initLobby(chatId); }

  async startGame(chatId) {
    const g = this.getGame(chatId);
    if (g.players.length < 3) {
      await this.bot.telegram.sendMessage(chatId, '⚠️ Нужно минимум 3 игрока.');
      return;
    }
    if (g.lobbyMessageId) {
      try { await this.bot.telegram.deleteMessage(chatId, g.lobbyMessageId); } catch {};
      g.lobbyMessageId = null;
    }
    g.round = 1;
    return this.runRound(chatId);
  }

  async runRound(chatId) {
    const g = this.getGame(chatId);
    if (g.resultMessageId) {
      try { await this.bot.telegram.deleteMessage(chatId, g.resultMessageId); } catch {};
      g.resultMessageId = null;
    }
    g.state = 'answer';
    g.currentLiar = randomItem(g.players);
    g.answers = {};
    g.votes = {};
    g.honestQ = randomItem(questions);
    do { g.liarQ = randomItem(questions); } while (g.liarQ === g.honestQ);

    for (const p of g.players) {
      const privateText = p.id === g.currentLiar.id
        ? `🕵️‍♂️ Ты — Лжец! Вопрос: ${g.liarQ}`
        : `❓ Раунд ${g.round}. Вопрос: ${g.honestQ}`;
      await this.bot.telegram.sendMessage(p.id, privateText);
    }
    setTimeout(() => this.startVoting(chatId), 60000);
  }

  async recordAnswer(userId, text) {
    for (const g of this.games.values()) {
      if (g.state === 'answer' && g.players.some(p => p.id === userId)) {
        g.answers[userId] = text;
        return true;
      }
    }
    return false;
  }

  async startVoting(chatId) {
    const g = this.getGame(chatId);
    g.state = 'vote';
    if (g.lobbyMessageId) {
      try { await this.bot.telegram.deleteMessage(chatId, g.lobbyMessageId); } catch {};
      g.lobbyMessageId = null;
    }
    const voteButtons = g.players.map(p => Markup.button.callback(`👤 ${p.name} (0)`, `vote_${p.id}`));
    const answersDisplay = g.players.map(p => `• ${p.name}: "${g.answers[p.id] || '—'}"`).join('\n');
    const intro =
      `🗳️ Раунд ${g.round} — голосование!\n` +
      `❓ Вопрос: ${g.honestQ}\n📝 Ответы:\n${answersDisplay}`;
    const msg = await this.bot.telegram.sendMessage(chatId, intro, { reply_markup: { inline_keyboard: [voteButtons] } });
    g.votingMessageId = msg.message_id;
    setTimeout(() => {
      if (g.votingMessageId) {
        try { this.bot.telegram.deleteMessage(chatId, g.votingMessageId); } catch {};
        g.votingMessageId = null;
      }
    }, 30000);
  }

  async recordVote(voterId, votedId, chatId) {
    const g = this.getGame(chatId);
    if (g.state !== 'vote') return;
    if (!g.votes[voterId]) {
      g.votes[voterId] = votedId;
      const counts = {};
      Object.values(g.votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
      const updatedButtons = g.players.map(p => Markup.button.callback(`👤 ${p.name} (${counts[p.id] || 0})`, `vote_${p.id}`));
      await this.bot.telegram.editMessageReplyMarkup(chatId, g.votingMessageId, null, { inline_keyboard: [updatedButtons] });
    }
    if (Object.keys(g.votes).length >= g.players.length) {
      await this.finishVoting(chatId);
    }
  }

  async finishVoting(chatId) {
    const g = this.getGame(chatId);
    if (g.state !== 'vote') return;
    g.state = 'lobby';
    if (g.votingMessageId) { try { await this.bot.telegram.deleteMessage(chatId, g.votingMessageId); } catch {}; g.votingMessageId = null; }
    const counts = {};
    Object.values(g.votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
    const correctVotes = counts[g.currentLiar.id] || 0;
    const total = g.players.length;
    const majority = correctVotes > total / 2;
    g.players.forEach(p => {
      if (g.votes[p.id] === String(g.currentLiar.id)) {
        let pts = 3; if (correctVotes===1) pts=5; else if (majority) pts+=1;
        g.scores[p.id] += pts;
      }
      if (p.id===g.currentLiar.id) {
        let pts=0; if (correctVotes===0) pts=6; else if (correctVotes<total/2) pts=3; else if (correctVotes===total) pts=-1;
        g.scores[p.id]+=pts;
      }
    });
    const board = g.players.map(p=>`• ${p.name}: ${g.scores[p.id]} очков (${counts[p.id]||0})`).join('\n');
    const liarLine = correctVotes===0?'🤥 Лжец не пойман(+6)':correctVotes<total/2?'🤥 Частично(+3)':correctVotes===total?'🤥 Полностью(-1)':'🤥 Ускользнул(0)';
    const resultText = `🏁 Итоги раунда ${g.round}:\nЛжец: ${g.currentLiar.name}\n${liarLine}\n\n📊 Счёт:\n${board}`;
    const msg = await this.bot.telegram.sendMessage(chatId, resultText);
    g.resultMessageId = msg.message_id;
    if (g.round<this.maxRounds) { g.round++; setTimeout(()=>this.runRound(chatId),5000); }
    else { await this.bot.telegram.sendMessage(chatId, `🎉 Игра окончена! Финал:\n${board}`); this.games.delete(chatId); }
  }
}

module.exports = { GameManager };