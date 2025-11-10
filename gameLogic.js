// gameLogic.js — simple, but robust X01 game logic
// Exports GameLogic class

export class GameLogic {
  constructor(room) {
    this.room = room;
    this.players = Array.isArray(room.players) ? room.players.slice() : [];
    this.currentPlayerIndex = 0;
    this.scores = {};
    this.isStarted = false;
    this.winner = null;
    this.turnHistory = []; // for undo
    this.reset();
  }

  reset() {
    const dist = parseInt(this.room.options?.distance) || 501;
    for (const p of this.players) this.scores[p] = dist;
    this.currentPlayerIndex = 0;
    this.winner = null;
    this.isStarted = false;
    this.turnHistory = [];
  }

  start() {
    this.isStarted = true;
    this.currentPlayerIndex = 0;
  }

  playerThrow(playerId, points = 0) {
    points = Number(points) || 0;
    if (!this.isStarted || this.winner) return false;
    const current = this.players[this.currentPlayerIndex];
    if (current !== playerId) return false;

    // Save for undo
    this.turnHistory.push({
      playerId,
      points,
      prevScore: this.scores[playerId],
      time: Date.now()
    });

    // Apply points
    this.scores[playerId] -= points;
    if (this.scores[playerId] <= 0) {
      this.scores[playerId] = 0;
      this.winner = playerId;
      this.isStarted = false;
    } else {
      // next player
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
    return true;
  }

  undoLastThrow() {
    if (!this.turnHistory.length) return false;
    const last = this.turnHistory.pop();
    if (!last) return false;
    this.scores[last.playerId] = last.prevScore;
    this.winner = null;
    this.isStarted = true;
    // attempt to restore turn index to that player
    const idx = this.players.indexOf(last.playerId);
    if (idx >= 0) this.currentPlayerIndex = idx;
    return true;
  }

  getState() {
    return {
      players: this.players.slice(),
      scores: { ...this.scores },
      isStarted: this.isStarted,
      currentPlayerId: this.players[this.currentPlayerIndex] ?? null,
      winner: this.winner,
      // HINZUGEFÜGT: Stellt die Raum-Optionen für den Client bereit
      options: this.room.options || {} 
    };
  }
}