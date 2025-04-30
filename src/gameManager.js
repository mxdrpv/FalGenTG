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
        votingMessageId: null, resultMessageId: null
      });
    }
    return this.games.get(chatId);
  }

  // Лобби
  async initLobby(chatId) {
    const g = this.getGame(chatId);
    g.state = 'lobby';
    const names = g.players.map(p => p.name).join(', ') || '—';
    const text = `🎲 Лобби «Лживый Гений»\nИгроки (${g.players.length}): ${names}`;
    const buttons = [Markup.button.callback('▶️ Вступить', 'join'), Markup.button.callback('⏹️ Выйти', 'leave')];
    if (g.players.length >= 3) buttons.push(Markup.button.callback('🚀 Начать игру', 'start_game'));
    const opts = { reply_markup: { inline_keyboard: [buttons] } };
    if (g.lobbyMessageId) {
      try { await this.bot.telegram.editMessageText(chatId, g.lobbyMessageId, null, text, opts); } catch (e) {}
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

  // Старт игры
  async startGame(chatId) {
    const g = this.getGame(chatId);
    if (g.players.length < 3) return this.bot.telegram.sendMessage(chatId, '⚠️ Нужно минимум 3 игрока.');
    if (g.lobbyMessageId) {
      try { await this.bot.telegram.deleteMessage(chatId, g.lobbyMessageId); } catch (e) {}
      g.lobbyMessageId = null;
    }
    g.round = 1;
    return this.runRound(chatId);
  }

  // Начало раунда
  async runRound(chatId) {
    const g = this.getGame(chatId);
    if (g.resultMessageId) {
      if (g.resultMessageId) {
        try { await this.bot.telegram.deleteMessage(chatId, g.resultMessageId); } catch (e) {}
        g.resultMessageId = null;
      }
    }

    g.state = 'answer';
    g.currentLiar = randomItem(g.players);
    g.answers = {}; g.votes = {};

    g.honestQ = randomItem(questions);
    let liarQ = randomItem(questions);
    while (liarQ === g.honestQ) liarQ = randomItem(questions);
    g.liarQ = liarQ;

    for (const p of g.players) {
      const text = p.id === g.currentLiar.id
        ? `🕵️‍♂️ Ты — Лжец! Вопрос: ${g.liarQ}`
        : `❓ Раунд ${g.round}. Вопрос: ${g.honestQ}`;
      await this.bot.telegram.sendMessage(p.id, text);
    }

    setTimeout(() => this.startVoting(chatId), 60000);
  }

  async recordAnswer(userId, text) {
    for (const [chatId, g] of this.games) {
      if (g.state === 'answer' && g.players.some(p => p.id === userId)) {
        g.answers[userId] = text;
        return true;
      }
    }
    return false;
  }

  // Голосование
  async startVoting(chatId) {
    const g = this.getGame(chatId);
    g.state = 'vote';
    if (g.lobbyMessageId) {
      try { await this.bot.telegram.deleteMessage(chatId, g.lobbyMessageId); } catch (e) {}
      g.lobbyMessageId = null;
    }

    const buttons = g.players.map(p => Markup.button.callback(`👤 ${p.name} (0)`, `vote_${p.id}`));
    const intro = `🗳️ Раунд ${g.round} — голосование!\n❓ Вопрос: ${g.honestQ}`;
    const answerLines = g.players.map(p => `• ${p.name}: "${g.answers[p.id] || '—'}"`).join('\n');

    const msg = await this.bot.telegram.sendMessage(chatId, `${intro}\n
📝 Ответы:\n${answerLines}`,
      { reply_markup: { inline_keyboard: [buttons] } }
    );
    g.votingMessageId = msg.message_id;

    // Автоудаление голосования через 30 сек с проверкой ID
    setTimeout(() => {
      if (g.votingMessageId) {
        try { this.bot.telegram.deleteMessage(chatId, g.votingMessageId); } catch (e) {}
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
      for (const v of Object.values(g.votes)) counts[v] = (counts[v] || 0) + 1;
      const buttons = g.players.map(p => Markup.button.callback("👤 " + p.name + ` (${counts[p.id] || 0})`, `vote_${p.id}`));
      await this.bot.telegram.editMessageReplyMarkup(chatId, g.votingMessageId, null, { inline_keyboard: [buttons] });
    }
    if (Object.keys(g.votes).length >= g.players.length) this.finishVoting(chatId);
  }

  // Итоги раунда
  async finishVoting(chatId) {
    const g = this.getGame(chatId);
    if (g.state !== 'vote') return;
    g.state = 'lobby';

    // Безопасное удаление голосования
    if (g.votingMessageId) {
      try { await this.bot.telegram.deleteMessage(chatId, g.votingMessageId); } catch {};
      g.votingMessageId = null;
    }

    // Подсчёт голосов
    const counts = {};
    for (const v of Object.values(g.votes)) counts[v] = (counts[v] || 0) + 1;
    const correctVotes = counts[g.currentLiar.id] || 0;
    const total = g.players.length;
    const majority = correctVotes > total / 2;

    // Начисление очков детективам
    for (const p of g.players) {
      if (g.votes[p.id] === String(g.currentLiar.id)) {
        let pts = 3;                     // базовые +3
        if (correctVotes === 1) pts = 5; // детектив от бога
        else if (majority) pts += 1;     // тимворк: большинство
        g.scores[p.id] += pts;
      }
    }

    // Начисление очков лжецу
    for (const p of g.players) {
      if (p.id === g.currentLiar.id) {
        let pts = 0;
        if (correctVotes === 0) pts = 6;                  // дьявольский гений
        else if (correctVotes < total / 2) pts = 3;       // частичное разоблачение
        else if (correctVotes === total) pts = -1;        // полный провал
        // иначе pts = 0
        g.scores[p.id] += pts;
      }
    }

    // Формируем вывод
    const board = g.players.map(p =>
      `• ${p.name}: ${g.scores[p.id]} очков (голосов: ${counts[p.id] || 0})`
    ).join('\n');

    const liarLine = 
      correctVotes === 0 ? '🤥 Лжец не пойман, получает +6' :
      correctVotes < total / 2 ? '🤥 Лжец частично раскрыт, получает +3' :
      correctVotes === total ? '🤥 Лжец полностью раскрыт, получает -1' :
      '🤥 Лжец ускользнул, получает 0';

    const resultText = [
      `🏁 Итоги раунда ${g.round}:`,
      `Лжец: ${g.currentLiar.name}`,
      liarLine,
      `\n📊 Счёт:\n${board}`
    ].join('\n');

    const msg = await this.bot.telegram.sendMessage(chatId, resultText);
    g.resultMessageId = msg.message_id;

    // Следующий раунд или завершение
    if (g.round < this.maxRounds) {
      g.round++;
      setTimeout(() => this.runRound(chatId), 5000);
    } else {
      await this.bot.telegram.sendMessage(chatId, `🎉 Игра окончена! Финальные результаты:\n${board}`);
      this.games.delete(chatId);
    }
  }
}

module.exports = { GameManager };