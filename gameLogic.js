// gameLogic.js
// Serverseitige Spiel-Engine für DOCA WebDarts
// Erweiterung: 3-Dart-Runden (max 3 Würfe pro Zug)

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

    // Round/turn tracking
    this.turnThrowCount = 0; // how many single-dart throws in current turn (0..3)
    this.turnAccum = 0; // accumulated points in this turn (sum of throws)
    this.turnPlayer = this.players[0] || null; // clientId who is on turn

    this.winner = null;
  }

  start() {
    if (this.players.length === 0) throw new Error("Keine Spieler im Raum");
    this.started = true;
    this.currentIndex = 0;
    this.winner = null;
    this.lastThrow = null;
    this.turnThrowCount = 0;
    this.turnAccum = 0;
    this.players.forEach((p) => (this.scores[p] = this.startingScore));
    this.turnPlayer = this.players[this.currentIndex] ?? null;
    return this.getState();
  }

  addPlayer(clientId) {
    if (!this.players.includes(clientId)) {
      this.players.push(clientId);
      this.scores[clientId] = this.startingScore;
    }
  }

  removePlayer(clientId) {
    const i = this.players.indexOf(clientId);
    if (i !== -1) this.players.splice(i, 1);
    delete this.scores[clientId];
    if (this.currentIndex >= this.players.length) this.currentIndex = 0;
    if (this.players.length === 0) this.started = false;
    // adjust turnPlayer if needed
    this.turnPlayer = this.players[this.currentIndex] ?? null;
  }

  // Internal: advance turn (reset turn accumulators)
  nextTurn() {
    if (this.players.length === 0) {
      this.currentIndex = 0;
      this.turnPlayer = null;
      this.turnThrowCount = 0;
      this.turnAccum = 0;
      return;
    }
    this.currentIndex = (this.currentIndex + 1) % this.players.length;
    this.turnPlayer = this.players[this.currentIndex];
    this.turnThrowCount = 0;
    this.turnAccum = 0;
  }

  // Handle a single dart throw by playerId with value
  // Returns { ok, state, message }
  playerThrow(playerId, value) {
    if (!this.started) return { ok: false, message: "Spiel läuft nicht" };
    if (this.winner) return { ok: false, message: "Spiel bereits beendet" };
    if (this.turnPlayer !== playerId) return { ok: false, message: "Nicht dein Zug" };

    const v = Math.max(0, Number(value) || 0);

    const prev = this.scores[playerId] ?? this.startingScore;
    const provisional = prev - (this.turnAccum + v);

    // Record this single throw in lastThrow (for logging)
    this.lastThrow = {
      playerId,
      value: v,
      result: null, // we'll set after evaluation
      prev,
      provisional,
      timestamp: Date.now(),
      turnThrowNumber: this.turnThrowCount + 1,
    };

    // If provisional < 0 -> bust occurs at end of turn; but we still consume this throw
    this.turnAccum += v;
    this.turnThrowCount += 1;

    // Check immediate win (if provisional === 0) -> win immediately
    if (provisional === 0) {
      // Apply win
      this.scores[playerId] = 0;
      this.winner = playerId;
      this.lastThrow.result = "win";
      this.started = false;
      // reset turn counters
      this.turnThrowCount = 0;
      this.turnAccum = 0;
      return { ok: true, state: this.getState(), message: "Gewinner" };
    }

    // If provisional < 0 -> bust. On bust we must reset score to prev at end of turn.
    if (provisional < 0) {
      // Mark as bust (score stays unchanged now, but we advance turn)
      this.lastThrow.result = "bust";
      // Immediately end turn (bust ends the turn even if throws remain)
      // Reset accum and advance turn
      this.turnAccum = 0;
      this.turnThrowCount = 0;
      this.nextTurn();
      return { ok: true, state: this.getState(), message: "Bust" };
    }

    // provisional > 0: valid so far. If player used 3 throws, commit accumulated to their score and next turn.
    if (this.turnThrowCount >= 3) {
      // commit
      const newScore = prev - this.turnAccum;
      this.scores[playerId] = newScore;
      this.lastThrow.result = "ok";
      // reset accum and advance
      this.turnAccum = 0;
      this.turnThrowCount = 0;
      this.nextTurn();
      return { ok: true, state: this.getState(), message: "Wurfreihe abgeschlossen" };
    }

    // Otherwise, we are mid-turn (1 or 2 throws used), do not advance turn yet
    this.lastThrow.result = "ok";
    return { ok: true, state: this.getState(), message: "Wurf angenommen" };
  }

  // Commit turn (force end of turn) - not strictly necessary, kept for completeness
  commitTurn() {
    if (!this.turnPlayer) return;
    const pid = this.turnPlayer;
    const prev = this.scores[pid] ?? this.startingScore;
    const newScore = prev - this.turnAccum;
    if (newScore < 0) {
      // bust -> revert (do nothing)
    } else {
      this.scores[pid] = newScore;
      if (newScore === 0) this.winner = pid;
    }
    this.turnAccum = 0;
    this.turnThrowCount = 0;
    if (!this.winner) this.nextTurn();
  }

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
      turnThrowCount: this.turnThrowCount, // 0..3
      turnAccum: this.turnAccum, // accumulated points this turn
      lastThrow: this.lastThrow,
      winner: this.winner,
      startingScore: this.startingScore,
    };
  }
}
