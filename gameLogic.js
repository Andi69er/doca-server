// gameLogic.js
// ===========================================
// Simple 501 SI/DO engine (Single In, Double Out).
// - supports players as ws objects
// - expects addPlayer(ws, meta), removePlayer(ws), start(), handleThrow(ws, payload)
// - not persistent, lightweight for realtime play
// ===========================================

export class GameLogic {
  constructor(roomId, sendToRoom) {
    this.roomId = roomId;
    this.sendToRoom = sendToRoom; // function(obj) -> broadcast to room
    this.players = []; // [{ ws, meta, score, started }]
    this.currentIndex = 0;
    this.started = false;
    this.startScore = 501;
  }

  addPlayer(ws, meta) {
    // avoid duplicates
    if (this.players.find((p) => p.ws === ws)) return;
    this.players.push({
      ws,
      meta: { id: meta.id, username: meta.username },
      score: this.startScore,
      hasStarted: false, // for Single-In rule
    });
    this._broadcastState();
  }

  removePlayer(ws) {
    this.players = this.players.filter((p) => p.ws !== ws);
    if (this.currentIndex >= this.players.length) this.currentIndex = 0;
    this._broadcastState();
  }

  getPlayersInfo() {
    return this.players.map((p) => ({ id: p.meta.id, name: p.meta.username }));
  }

  start() {
    if (this.players.length < 1) return false;
    this.started = true;
    this.currentIndex = 0;
    // reset scores
    for (const p of this.players) {
      p.score = this.startScore;
      p.hasStarted = false;
    }
    this._broadcastState();
    return true;
  }

  handleThrow(ws, payload = {}) {
    if (!this.started) {
      this.sendToRoom({ type: "info", message: "Kein Spiel aktiv." });
      return;
    }
    const playerIndex = this.players.findIndex((p) => p.ws === ws);
    if (playerIndex === -1) return;
    if (playerIndex !== this.currentIndex) {
      // only current player can throw
      this.sendToRoom({ type: "info", message: `${this.players[playerIndex].meta.username} versucht zu werfen, aber ist nicht am Zug.` });
      return;
    }

    // payload can be: { darts: [{value, mult},{...}] } OR { darts: [60, 20, 1] } simple formats
    const darts = this._normalizePayload(payload);
    // process sequentially: total of the three darts, but Single-In rule means first scoring hit starts score subtraction
    let player = this.players[this.currentIndex];
    let originalScore = player.score;
    let tempScore = player.score;
    let madeScoreIn = player.hasStarted; // if true, already in

    // process each dart
    for (const d of darts) {
      if (!madeScoreIn) {
        // Single-In: any non-zero single/triple/double counts as having started
        if (d.total > 0) madeScoreIn = true;
        if (!madeScoreIn) continue;
      }
      // apply
      tempScore -= d.total;
      // Bust rules: if tempScore < 0 -> bust, if tempScore == 1 -> bust (cannot finish on 1), if tempScore == 0 but last dart wasn't double -> bust (Double-out)
      const lastWasDouble = d.mult === 2;
      if (tempScore < 0 || tempScore === 1) {
        // bust: reset to original score, end turn
        tempScore = originalScore;
        this.sendToRoom({ type: "info", message: `Bust! ${player.meta.username} bleibt bei ${originalScore}` });
        this._advanceTurn();
        this._broadcastState();
        return;
      }
      if (tempScore === 0) {
        // must end on double (Double Out)
        if (!lastWasDouble) {
          // invalid finish -> bust
          tempScore = originalScore;
          this.sendToRoom({ type: "info", message: `Finish muss Double sein! Bust.` });
          this._advanceTurn();
          this._broadcastState();
          return;
        } else {
          // win
          player.score = 0;
          this.sendToRoom({
            type: "game_over",
            winner: { id: player.meta.id, name: player.meta.username },
            room: this.roomId,
          });
          this.started = false;
          this._broadcastState();
          return;
        }
      }
      // otherwise continue to next dart
    }

    // no bust, update score
    player.score = tempScore;
    player.hasStarted = madeScoreIn;
    this.sendToRoom({
      type: "score_update",
      player: { id: player.meta.id, name: player.meta.username, score: player.score },
      room: this.roomId,
    });

    // after turn, advance
    this._advanceTurn();
    this._broadcastState();
  }

  _advanceTurn() {
    if (this.players.length <= 1) return;
    this.currentIndex = (this.currentIndex + 1) % this.players.length;
  }

  _broadcastState() {
    const state = {
      type: "game_state",
      players: this.players.map((p, idx) => ({
        id: p.meta.id,
        name: p.meta.username,
        score: p.score,
        active: idx === this.currentIndex,
      })),
      started: this.started,
      currentPlayer: this.players[this.currentIndex] ? this.players[this.currentIndex].meta.username : null,
    };
    this.sendToRoom(state);
  }

  _normalizePayload(payload) {
    // return array of dart objects {value, mult, total, isDouble, isTriple}
    const out = [];
    if (Array.isArray(payload.darts)) {
      for (const d of payload.darts) {
        if (typeof d === "number") {
          // treat as single value
          out.push({ value: d, mult: 1, total: d });
        } else if (typeof d === "object") {
          const value = Number(d.value || 0);
          const mult = Number(d.mult || 1);
          out.push({
            value,
            mult,
            total: value * mult,
            isDouble: mult === 2,
            isTriple: mult === 3,
          });
        } else {
          out.push({ value: 0, mult: 0, total: 0 });
        }
      }
    } else if (payload.value) {
      const value = Number(payload.value || 0);
      const mult = Number(payload.mult || 1);
      out.push({ value, mult, total: value * mult });
    }
    return out.slice(0, 3); // max 3 darts
  }
}
