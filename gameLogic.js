// ============================================================
// DOCA WebDarts PRO – erweiterte Spielengine (kompatibel mit ES Modules)
// ============================================================
// Enthält: Standard 301–1001, Cricket, DoubleIn/Out, MasterOut, Undo, Bulling
// ============================================================

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

class Game {
  constructor(roomId, players = [], options = {}) {
    this.roomId = roomId;
    this.options = {
      startingScore: Number(options.startingScore) || 501,
      variant: options.variant || "standard",
      finishType: options.finishType || "double_out",
      doubleIn: !!options.doubleIn,
      startChoice: options.startChoice || "first", // first|second|bull
    };

    this.mode = this.options.variant === "cricket" ? "cricket" : "standard";
    this.startingScore = this.options.startingScore;
    this.finishType = this.options.finishType;
    this.doubleIn = this.options.doubleIn;
    this.startChoice = this.options.startChoice;

    this.players = Array.from(players);
    this.scores = {};
    this.opened = {};
    this.currentIndex = 0;
    this.started = false;
    this.winner = null;

    this.turnThrowCount = 0;
    this.turnAccum = 0;
    this.turnPlayer = null;
    this.lastThrow = null;
    this.snapshots = [];

    this.bulling = this.startChoice === "bull";
    this.bullShots = {};

    this.cricketTargets = [20, 19, 18, 17, 16, 15, 25];
    this.cricketMarks = {};
    this.cricketScores = {};

    this.history = [];

    this.players.forEach(p => {
      this.scores[p] = this.startingScore;
      this.opened[p] = !this.doubleIn;
      this.cricketMarks[p] = {};
      this.cricketTargets.forEach(t => (this.cricketMarks[p][t] = 0));
      this.cricketScores[p] = 0;
    });
    this.turnPlayer = this.players[this.currentIndex] || null;
  }

  pushSnapshot() {
    const snap = {
      scores: deepCopy(this.scores),
      opened: deepCopy(this.opened),
      cricketMarks: deepCopy(this.cricketMarks),
      cricketScores: deepCopy(this.cricketScores),
      currentIndex: this.currentIndex,
      turnThrowCount: this.turnThrowCount,
      turnAccum: this.turnAccum,
      turnPlayer: this.turnPlayer,
      lastThrow: deepCopy(this.lastThrow),
      winner: this.winner,
    };
    this.snapshots.push(snap);
    if (this.snapshots.length > 50) this.snapshots.shift();
  }

  undoLastThrow(requestingClientId) {
    if (!this.snapshots.length)
      return { ok: false, message: "Keine Aktion zum Rückgängig machen" };

    const lastThrow = this.lastThrow;
    if (!lastThrow)
      return { ok: false, message: "Kein letzter Wurf vorhanden" };
    if (lastThrow.playerId !== requestingClientId)
      return {
        ok: false,
        message: "Nur der, der den letzten Wurf machte, kann Undo ausführen",
      };

    const snap = this.snapshots.pop();
    this.scores = deepCopy(snap.scores);
    this.opened = deepCopy(snap.opened);
    this.cricketMarks = deepCopy(snap.cricketMarks);
    this.cricketScores = deepCopy(snap.cricketScores);
    this.currentIndex = snap.currentIndex;
    this.turnThrowCount = snap.turnThrowCount;
    this.turnAccum = snap.turnAccum;
    this.turnPlayer = snap.turnPlayer;
    this.lastThrow = snap.lastThrow;
    this.winner = snap.winner;

    this.history.push({ type: "undo", by: requestingClientId, at: Date.now() });
    return { ok: true, state: this.getState(), message: "Undo erfolgreich" };
  }

  decideStarter(callerId = null) {
    if (this.startChoice === "first") {
      this.currentIndex = 0;
      return;
    }
    if (this.startChoice === "second") {
      this.currentIndex = 1 % this.players.length;
      return;
    }
    if (this.startChoice === "bull") {
      this.currentIndex = 0;
      return;
    }
    this.currentIndex = 0;
  }

  start(callerId = null) {
    this.decideStarter(callerId);
    this.started = true;
    this.winner = null;
    this.lastThrow = null;
    this.turnThrowCount = 0;
    this.turnAccum = 0;
    this.turnPlayer = this.players[this.currentIndex] || null;
    this.snapshots = [];
    this.history = [];

    this.players.forEach(p => {
      this.scores[p] = this.startingScore;
      this.opened[p] = !this.doubleIn;
      this.cricketTargets.forEach(t => (this.cricketMarks[p][t] = 0));
      this.cricketScores[p] = 0;
    });

    if (this.startChoice === "bull") {
      this.bulling = true;
      this.started = false;
      this.bullShots = {};
    } else {
      this.bulling = false;
    }
    return this.getState();
  }

  addPlayer(id) {
    if (!this.players.includes(id)) {
      this.players.push(id);
      this.scores[id] = this.startingScore;
      this.opened[id] = !this.doubleIn;
      this.cricketMarks[id] = {};
      this.cricketTargets.forEach(t => (this.cricketMarks[id][t] = 0));
      this.cricketScores[id] = 0;
    }
  }

  removePlayer(id) {
    const i = this.players.indexOf(id);
    if (i !== -1) this.players.splice(i, 1);
    delete this.scores[id];
    delete this.opened[id];
    delete this.cricketMarks[id];
    delete this.cricketScores[id];
    if (this.currentIndex >= this.players.length) this.currentIndex = 0;
    if (this.players.length === 0) this.started = false;
    this.turnPlayer = this.players[this.currentIndex] ?? null;
  }

  _normMult(m) {
    const mm = Number(m) || 1;
    return [1, 2, 3].includes(mm) ? mm : 1;
  }

  nextTurn() {
    if (!this.players.length) {
      this.currentIndex = 0;
      this.turnPlayer = null;
      return;
    }
    this.currentIndex = (this.currentIndex + 1) % this.players.length;
    this.turnPlayer = this.players[this.currentIndex];
    this.turnThrowCount = 0;
    this.turnAccum = 0;
  }

  handleBullShot(clientId, mult) {
    if (!this.bulling)
      return { ok: false, message: "Bulling nicht aktiv" };
    const m = this._normMult(mult);
    const bullScore = m === 2 ? 50 : 25;
    this.bullShots[clientId] = bullScore;
    if (Object.keys(this.bullShots).length >= this.players.length) {
      const entries = Object.entries(this.bullShots);
      const max = Math.max(...entries.map(e => e[1]));
      const winners = entries.filter(e => e[1] === max).map(e => e[0]);
      if (winners.length === 1) {
        const idx = this.players.indexOf(winners[0]);
        if (idx !== -1) this.currentIndex = idx;
        this.bulling = false;
        this.started = true;
        this.turnPlayer = this.players[this.currentIndex];
        this.bullShots = {};
        return {
          ok: true,
          state: this.getState(),
          message: `Bulling entschieden: ${winners[0]}`,
        };
      } else {
        this.bullShots = {};
        return {
          ok: true,
          state: this.getState(),
          message: "Bulling Unentschieden - Wiederholen",
        };
      }
    }
    return { ok: true, state: this.getState(), message: "Bull aufgenommen" };
  }

  playerThrow(playerId, value, mult = 1) {
    if (this.bulling) return { ok: false, message: "Bulling läuft" };
    if (!this.started) return { ok: false, message: "Spiel läuft nicht" };
    if (this.winner) return { ok: false, message: "Spiel beendet" };
    if (this.turnPlayer !== playerId)
      return { ok: false, message: "Nicht dein Zug" };

    const m = this._normMult(mult);
    const val = Number(value) || 0;

    this.pushSnapshot();
    this.lastThrow = {
      playerId,
      value: val,
      mult: m,
      result: null,
      prev: this.scores[playerId],
      timestamp: Date.now(),
    };

    // --- Cricket
    if (this.mode === "cricket") {
      const t = Number(value);
      if (![20, 19, 18, 17, 16, 15, 25].includes(t))
        return { ok: false, message: "Kein Cricket-Target" };
      const hits = this._normMult(mult);
      const before = this.cricketMarks[playerId][t] || 0;
      const total = before + hits;
      this.cricketMarks[playerId][t] = Math.min(3, total);
      if (total > 3) this.cricketScores[playerId] += (total - 3) * t;
      this.turnThrowCount++;
      if (this.turnThrowCount >= 3) this.nextTurn();
      return { ok: true, state: this.getState(), message: "Cricket hit" };
    }

    // --- Standard X01
    const scored = val * m;
    if (this.doubleIn && !this.opened[playerId]) {
      if (m === 2) this.opened[playerId] = true;
      else return { ok: true, state: this.getState(), message: "Double-In fehlt" };
    }

    this.turnAccum += scored;
    this.turnThrowCount++;
    const provisional = this.scores[playerId] - this.turnAccum;

    if (provisional < 0) {
      this.turnAccum = 0;
      this.turnThrowCount = 0;
      this.nextTurn();
      return { ok: true, state: this.getState(), message: "Bust" };
    }
    if (provisional === 0) {
      if (this.finishType === "double_out" && m !== 2)
        return { ok: true, state: this.getState(), message: "Invalid Finish" };
      this.scores[playerId] = 0;
      this.winner = playerId;
      this.started = false;
      return { ok: true, state: this.getState(), message: "Gewonnen" };
    }

    if (this.turnThrowCount >= 3) {
      this.scores[playerId] = provisional;
      this.turnAccum = 0;
      this.turnThrowCount = 0;
      this.nextTurn();
      return { ok: true, state: this.getState(), message: "Turn committed" };
    }

    return { ok: true, state: this.getState(), message: "Wurf angenommen" };
  }

  getState() {
    const cricket = {};
    if (this.mode === "cricket") {
      this.players.forEach(p => {
        cricket[p] = {
          marks: deepCopy(this.cricketMarks[p]),
          score: this.cricketScores[p],
        };
      });
    }
    return {
      type: "game_state",
      roomId: this.roomId,
      mode: this.mode,
      started: this.started,
      players: this.players,
      scores: deepCopy(this.scores),
      currentPlayer: this.turnPlayer,
      currentIndex: this.currentIndex,
      turnThrowCount: this.turnThrowCount,
      lastThrow: deepCopy(this.lastThrow),
      winner: this.winner,
      startingScore: this.startingScore,
      finishType: this.finishType,
      doubleIn: this.doubleIn,
      startChoice: this.startChoice,
      bulling: this.bulling,
      cricket,
    };
  }
}

// ============================================================
// Richtiger ES-Modul-Export
// ============================================================
export { Game };
