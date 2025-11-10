// gameLogic.js — DOCA WebDarts PRO (final, robust, copy & paste)

export class GameLogic {
  constructor(players = [], options = {}) {
    this.players = players;
    this.options = options;
    this.isStarted = false;
    this.winner = null;
    this.scores = {};
    this.currentPlayerIndex = 0;

    const startScore = parseInt(options.distance || 501);
    for (const pid of players) {
      this.scores[pid] = startScore;
    }
  }

  startGame() {
    if (this.players.length < 2) return false;
    this.isStarted = true;
    this.currentPlayerIndex = 0;
    return true;
  }

  get currentPlayerId() {
    return this.players[this.currentPlayerIndex] || null;
  }

  /**
   * Punkte abziehen und Spielstatus prüfen
   */
  throwDart(playerId, score) {
    if (!this.isStarted || this.winner) return;
    if (playerId !== this.currentPlayerId) return;

    const currentScore = this.scores[playerId];
    const newScore = currentScore - score;

    if (newScore === 0) {
      this.winner = playerId;
      this.isStarted = false;
    } else if (newScore < 0) {
      // kein gültiger Wurf, Runde bleibt
      this.nextPlayer();
    } else {
      this.scores[playerId] = newScore;
      this.nextPlayer();
    }
  }

  /**
   * Zum nächsten Spieler wechseln
   */
  nextPlayer() {
    this.currentPlayerIndex =
      (this.currentPlayerIndex + 1) % this.players.length;
  }

  /**
   * Aktuellen Spielstatus zurückgeben
   */
  getState() {
    return {
      isStarted: this.isStarted,
      scores: { ...this.scores },
      currentPlayerId: this.currentPlayerId,
      winner: this.winner
    };
  }
}

export default GameLogic;
