// gameLogic.js — Das Gehirn des Dart-Spiels
// Vollständige Datei — Copy & Paste

export class Game {
  constructor(players = [], options = {}) {
    this.players = Array.isArray(players) ? players.slice() : [];
    this.options = options || {};
    this.startingScore = parseInt(this.options.distance) || 501;
    this.finishType = this.options.finish || 'Double Out';
    this.resetGame();
  }

  resetGame() {
    this.scores = {};
    this.stats = {};
    this.players.forEach(p => {
      this.scores[p] = this.startingScore;
      this.stats[p] = { dartsThrown: 0, totalScore: 0, legsWon: 0 };
    });
    this.currentPlayerIndex = 0;
    this.winner = null;
    this.isStarted = false;
    this.turnThrows = [];
    this.history = [];
    this.scoreAtTurnStart = this.startingScore;
  }

  start() {
    this.resetGame();
    this.isStarted = true;
  }

  playerThrow(playerId, value, mult = 1) {
    if (!this.isStarted || this.winner) return;
    if (this.players[this.currentPlayerIndex] !== playerId) return;
    if (this.turnThrows.length >= 3) return;

    const throwScore = (Number(value) || 0) * (Number(mult) || 1);
    const currentScore = this.scores[playerId] ?? this.startingScore;

    // invalid finish checks
    if (currentScore - throwScore < 0) {
      // bust -> end turn
      this.nextPlayer();
      return;
    }
    if (currentScore - throwScore === 1) {
      this.nextPlayer();
      return;
    }
    if (currentScore - throwScore === 0 && this.finishType === 'Double Out' && (mult !== 2)) {
      this.nextPlayer();
      return;
    }

    // apply throw
    this.scores[playerId] = currentScore - throwScore;
    const throwObj = { playerId, value: Number(value), mult: Number(mult), score: throwScore, time: Date.now() };
    this.turnThrows.push(throwObj);
    this.history.push(throwObj);

    // stats
    if (!this.stats[playerId]) this.stats[playerId] = { dartsThrown: 0, totalScore: 0, legsWon: 0 };
    this.stats[playerId].dartsThrown++;
    this.stats[playerId].totalScore += throwScore;

    // check winner
    if (this.scores[playerId] === 0) {
      this.winner = playerId;
      this.isStarted = false;
      this.stats[playerId].legsWon++;
      return;
    }

    // if three darts -> next player
    if (this.turnThrows.length >= 3) {
      this.nextPlayer();
    }
  }

  undoLastThrow(playerId) {
    // allow undo only if it's the same player's current turn and we have throws
    if (!this.isStarted || this.players[this.currentPlayerIndex] !== playerId) return;
    if (this.turnThrows.length === 0) return;
    const last = this.turnThrows.pop();
    if (last) {
      // restore score
      this.scores[last.playerId] = (this.scores[last.playerId] ?? 0) + last.score;
      // adjust stats
      if (this.stats[last.playerId]) {
        this.stats[last.playerId].dartsThrown = Math.max(0, this.stats[last.playerId].dartsThrown - 1);
        this.stats[last.playerId].totalScore = Math.max(0, this.stats[last.playerId].totalScore - last.score);
      }
      // also pop from history (best-effort)
      if (this.history.length && this.history[this.history.length - 1] === last) this.history.pop();
    }
  }

  nextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % Math.max(1, this.players.length);
    this.turnThrows = [];
    this.scoreAtTurnStart = this.scores[this.players[this.currentPlayerIndex]] ?? this.startingScore;
  }

  getState() {
    const currentPlayerId = this.winner ? null : (this.players[this.currentPlayerIndex] ?? null);
    const liveStats = {};
    this.players.forEach(p => {
      const stat = this.stats[p] || { dartsThrown: 0, totalScore: 0, legsWon: 0 };
      const avg = stat.dartsThrown > 0 ? ((stat.totalScore / stat.dartsThrown) * 3) : 0;
      liveStats[p] = { avg: Number(avg).toFixed(2), dartsThrown: stat.dartsThrown, legsWon: stat.legsWon, totalScore: stat.totalScore };
    });

    return {
      type: "game_state",
      isStarted: !!this.isStarted,
      players: this.players.slice(),
      scores: Object.assign({}, this.scores),
      currentPlayer: currentPlayerId,
      turnThrowCount: this.turnThrows.length,
      turnAccum: this.turnThrows.reduce((s, t) => s + (t.score || 0), 0),
      lastThrow: this.history.length ? this.history[this.history.length - 1] : null,
      winner: this.winner,
      options: this.options,
      liveStats
    };
  }
}
