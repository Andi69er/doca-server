// gameLogic.js — simple X01 game logic
// Exports GameLogic class

export class GameLogic {
  constructor(room) {
    this.room = room;
    this.players = room.players.slice();
    this.currentPlayerIndex = 0;
    this.scores = {};
    this.isStarted = false;
    this.winner = null;
    this.reset();
  }

  reset() {
    const dist = parseInt(this.room.options?.distance) || 501;
    for (const p of this.players) this.scores[p] = dist;
    this.currentPlayerIndex = 0;
    this.winner = null;
    this.isStarted = false;
  }

  start() {
    this.isStarted = true;
    this.currentPlayerIndex = 0;
  }

  playerThrow(playerId, points = 0) {
    if (!this.isStarted || this.winner) return false;
    const current = this.players[this.currentPlayerIndex];
    if (current !== playerId) return false;
    this.scores[playerId] -= Number(points) || 0;
    if (this.scores[playerId] <= 0) {
      this.scores[playerId] = 0;
      this.winner = playerId;
      this.isStarted = false;
    } else {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
    return true;
  }

  undoLastThrow() {
    // Not implemented fully — placeholder to satisfy frontend calls
    return true;
  }

  getState() {
    return {
      players: this.players.slice(),
      scores: { ...this.scores },
      isStarted: this.isStarted,
      currentPlayerId: this.players[this.currentPlayerIndex],
      winner: this.winner
    };
  }
}
