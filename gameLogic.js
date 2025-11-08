// ===========================================
// gameLogic.js
// Serverseitige Spiel-Engine für DOCA WebDarts
// - Einfacher 501-Modus (kann erweitert werden)
// - Exportiert Game-Klasse
// ===========================================

/*
 Game state (per Room):
 {
   id: 'room-xxxx',
   mode: '501',
   startingScore: 501,
   players: [ clientId, ... ],
   scores: { clientId: remainingScore, ... },
   currentIndex: 0, // index in players[] whose turn it is
   started: true/false,
   lastThrow: { playerId, value, timestamp }
 }
*/

export class Game {
  constructor(roomId, players = [], startingScore = 501) {
    this.roomId = roomId;
    this.mode = "501";
    this.startingScore = Number(startingScore) || 501;
    this.players = Array.from(players); // clientIds
    this.scores = {};
    this.players.forEach((p) => (this.scores[p] = this.startingScore));
    this.currentIndex = 0;
    this.started = false;
    this.lastThrow = null;
    this.winner = null;
  }

  // Start the game (if enough players)
  start() {
    if (this.players.length === 0) throw new Error("Keine Spieler im Raum");
    this.started = true;
    this.currentIndex = 0;
    this.winner = null;
    this.lastThrow = null;
    // reset scores
    this.players.forEach((p) => (this.scores[p] = this.startingScore));
    return this.getState();
  }

  // Add player (if joins after game created)
  addPlayer(clientId) {
    if (!this.players.includes(clientId)) {
      this.players.push(clientId);
      this.scores[clientId] = this.startingScore;
    }
  }

  // Remove player
  removePlayer(clientId) {
    const i = this.players.indexOf(clientId);
    if (i !== -1) this.players.splice(i, 1);
    delete this.scores[clientId];
    if (this.currentIndex >= this.players.length) this.currentIndex = 0;
    if (this.players.length === 0) this.started = false;
  }

  // Player throws a dart — value is the points to subtract (integer)
  // Returns result object { ok, state, message }
  playerThrow(playerId, value) {
    if (!this.started) return { ok: false, message: "Spiel läuft nicht" };
    if (this.winner) return { ok: false, message: "Spiel bereits beendet" };
    if (this.players[this.currentIndex] !== playerId)
      return { ok: false, message: "Nicht dein Zug" };

    const v = Number(value) || 0;
    if (v < 0) return { ok: false, message: "Ungültiger Wurfwert" };

    const prev = this.scores[playerId] ?? this.startingScore;
    let newScore = prev - v;

    // Bust rule: if score < 0 -> bust, reset to prev, advance turn
    if (newScore < 0) {
      this.lastThrow = { playerId, value: v, result: "bust", prev, newScore: prev, timestamp: Date.now() };
      this.nextTurn();
      return { ok: true, state: this.getState(), message: "Bust" };
    }

    // If newScore === 0 -> player wins
    if (newScore === 0) {
      this.scores[playerId] = 0;
      this.winner = playerId;
      this.lastThrow = { playerId, value: v, result: "win", prev, newScore: 0, timestamp: Date.now() };
      this.started = false;
      return { ok: true, state: this.getState(), message: "Gewinner" };
    }

    // Valid throw, update score and advance turn
    this.scores[playerId] = newScore;
    this.lastThrow = { playerId, value: v, result: "ok", prev, newScore, timestamp: Date.now() };
    this.nextTurn();
    return { ok: true, state: this.getState(), message: "Wurf angenommen" };
  }

  // advance to next player's turn
  nextTurn() {
    if (this.players.length === 0) {
      this.currentIndex = 0;
      return;
    }
    this.currentIndex = (this.currentIndex + 1) % this.players.length;
  }

  // Get full state serializable to send to clients
  getState() {
    return {
      type: "game_state",
      roomId: this.roomId,
      mode: this.mode,
      started: this.started,
      players: this.players.slice(),
      scores: { ...this.scores },
      currentPlayerIndex: this.currentIndex,
      currentPlayer: this.players[this.currentIndex] ?? null,
      lastThrow: this.lastThrow,
      winner: this.winner,
      startingScore: this.startingScore,
    };
  }
}
