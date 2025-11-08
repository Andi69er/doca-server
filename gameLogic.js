// gameLogic.js
// DOCA WebDarts - erweiterte Spiel-Engine
// - Standard 3-dart 501-style with options (startScore 301..1001)
// - Finish rules: single_out, double_out, master_out (double or triple)
// - Double-In (DI) option: player must hit a double to "open" scoring
// - Cricket (simplified): track marks for 15-20 & bull
// - 3-dart rounds (turnThrowCount, turnAccum), lastThrow metadata
// - Throws require {value, mult} where mult=1 (S),2(D),3(T)

export class Game {
  constructor(roomId, players = [], options = {}) {
    this.roomId = roomId;
    this.mode = options.variant === "cricket" ? "cricket" : "standard";
    this.startingScore = Number(options.startingScore) || 501;
    this.finishType = options.finishType || "single_out"; // single_out|double_out|master_out
    this.doubleIn = !!options.doubleIn; // DI enabled?
    this.startChoice = options.startChoice || "first"; // first|second|bull
    this.players = Array.from(players);
    this.scores = {};
    this.opened = {}; // for double-in: opened[playerId] = true when double hit
    this.currentIndex = 0;
    this.started = false;
    this.lastThrow = null;
    this.turnThrowCount = 0;
    this.turnAccum = 0;
    this.turnPlayer = null;
    this.winner = null;

    // Cricket structures
    this.cricketTargets = [20,19,18,17,16,15,25]; // 25 as bull
    this.cricketMarks = {}; // {playerId: {20: hits, 19: hits, ..., 25: hits}}
    this.cricketScores = {}; // additional points when closed but opponents not yet

    // init players
    this.players.forEach(p => {
      this.scores[p] = this.startingScore;
      this.opened[p] = !this.doubleIn; // if DI off, opened true
      // cricket init
      this.cricketMarks[p] = {};
      this.cricketTargets.forEach(t => (this.cricketMarks[p][t] = 0));
      this.cricketScores[p] = 0;
    });
  }

  // Start game; decide who starts based on startChoice and optionally callerId
  start(callerId = null) {
    if (this.players.length === 0) throw new Error("Keine Spieler im Raum");
    // set starting index based on startChoice:
    if (this.startChoice === "first") {
      if (callerId) {
        const i = this.players.indexOf(callerId);
        if (i !== -1) this.currentIndex = i;
        else this.currentIndex = 0;
      } else this.currentIndex = 0;
    } else if (this.startChoice === "second") {
      if (callerId) {
        const i = this.players.indexOf(callerId);
        this.currentIndex = i === -1 ? 1 % this.players.length : (i + 1) % this.players.length;
      } else this.currentIndex = 1 % this.players.length;
    } else if (this.startChoice === "bull") {
      // Ausbullen: choose random among players (server-side quick approximation)
      this.currentIndex = Math.floor(Math.random() * this.players.length);
    } else {
      this.currentIndex = 0;
    }

    this.started = true;
    this.winner = null;
    this.lastThrow = null;
    this.turnThrowCount = 0;
    this.turnAccum = 0;
    this.turnPlayer = this.players[this.currentIndex] || null;
    // reset scores & opened & cricket
    this.players.forEach(p => {
      this.scores[p] = this.startingScore;
      this.opened[p] = !this.doubleIn;
      this.cricketTargets.forEach(t => (this.cricketMarks[p][t] = 0));
      this.cricketScores[p] = 0;
    });

    return this.getState();
  }

  addPlayer(clientId) {
    if (!this.players.includes(clientId)) {
      this.players.push(clientId);
      this.scores[clientId] = this.startingScore;
      this.opened[clientId] = !this.doubleIn;
      this.cricketMarks[clientId] = {};
      this.cricketTargets.forEach(t => (this.cricketMarks[clientId][t] = 0));
      this.cricketScores[clientId] = 0;
    }
  }

  removePlayer(clientId) {
    const i = this.players.indexOf(clientId);
    if (i !== -1) this.players.splice(i, 1);
    delete this.scores[clientId];
    delete this.opened[clientId];
    delete this.cricketMarks[clientId];
    delete this.cricketScores[clientId];
    if (this.currentIndex >= this.players.length) this.currentIndex = 0;
    if (this.players.length === 0) this.started = false;
    this.turnPlayer = this.players[this.currentIndex] ?? null;
  }

  // helper: validate multiplier (1,2,3)
  _normMult(m) {
    const mm = Number(m) || 1;
    if (mm !== 1 && mm !== 2 && mm !== 3) return 1;
    return mm;
  }

  // commit accumulated points at end of a turn (used in standard mode)
  _commitTurnForPlayer(pid) {
    const prev = this.scores[pid] ?? this.startingScore;
    const newScore = prev - this.turnAccum;
    // if provisional < 0 => bust -> revert to prev (do nothing)
    if (newScore < 0) {
      // bust -> no change
    } else {
      // update
      this.scores[pid] = newScore;
      // check win applying finish rules
      if (newScore === 0) {
        // apply finish rule checks: require double_out or master_out
        // lastThrow stored contains mult of last single dart
        if (this.finishType === "single_out") {
          this.winner = pid;
        } else if (this.finishType === "double_out") {
          const lastMult = this.lastThrow?.mult || 1;
          if (lastMult === 2) this.winner = pid;
          else {
            // invalid finish -> bust: revert to prev
            this.scores[pid] = prev;
          }
        } else if (this.finishType === "master_out") {
          const lastMult = this.lastThrow?.mult || 1;
          if (lastMult === 2 || lastMult === 3) this.winner = pid;
          else {
            // invalid finish -> bust
            this.scores[pid] = prev;
          }
        } else {
          // default: single_out
          this.winner = pid;
        }
      }
    }
    // reset turn accumators
    this.turnAccum = 0;
    this.turnThrowCount = 0;
  }

  // handle cricket single dart
  _handleCricketThrow(playerId, value, mult) {
    // value must be one of cricketTargets or bull(25)
    const t = Number(value);
    if (!this.cricketTargets.includes(t)) {
      // no effect, just count as lastThrow
      return { ok: false, message: "Kein Cricket-Target" };
    }
    // count hits: mult = 1/2/3 adds that many marks
    const hitsToAdd = this._normMult(mult);
    // add marks up to 3 per target per player
    const before = this.cricketMarks[playerId][t] || 0;
    const newHits = Math.min(3, before + hitsToAdd);
    const added = newHits - before;
    this.cricketMarks[playerId][t] = newHits;

    // If player scored beyond 3 (i.e., opponent hasn't closed) they get points:
    // extraHits = (before + hitsToAdd) - 3
    const extra = Math.max(0, before + hitsToAdd - 3);
    if (extra > 0) {
      // points = extra * targetValue (bull=25)
      this.cricketScores[playerId] += extra * (t === 25 ? 25 : t);
    }
    // closing logic/finish detection:
    // win when player has closed all targets (all >=3) AND has >= opponents' score (or greater)
    const playerClosedAll = this.cricketTargets.every(tt => this.cricketMarks[playerId][tt] >= 3);
    if (playerClosedAll) {
      // check others closed?
      const othersClosed = this.players.every(p => {
        if (p === playerId) return true;
        return this.cricketTargets.every(tt => this.cricketMarks[p][tt] >= 3);
      });
      if (othersClosed) {
        // decide winner by cricketScores (higher wins)
        // if tie, continue (no winner yet)
        const myScore = this.cricketScores[playerId] || 0;
        const maxOther = Math.max(...this.players.filter(p => p !== playerId).map(p => this.cricketScores[p] || 0), 0);
        if (myScore >= maxOther) {
          this.winner = playerId;
          this.started = false;
          return { ok: true, message: "Cricket winner" };
        }
      }
    }
    return { ok: true, message: "Cricket hit", added, newHits };
  }

  // Main throw handler — expects {value, mult}
  playerThrow(playerId, value, mult = 1) {
    if (!this.started) return { ok: false, message: "Spiel läuft nicht" };
    if (this.winner) return { ok: false, message: "Spiel bereits beendet" };
    if (this.turnPlayer !== playerId) return { ok: false, message: "Nicht dein Zug" };

    const m = this._normMult(mult);
    const val = Number(value) || 0;

    // populate lastThrow base
    this.lastThrow = {
      playerId,
      value: val,
      mult: m,
      result: null,
      prev: this.scores[playerId],
      provisional: null,
      timestamp: Date.now(),
      turnThrowNumber: this.turnThrowCount + 1
    };

    if (this.mode === "cricket") {
      // cricket handling: every single dart applied immediately
      const res = this._handleCricketThrow(playerId, val, m);
      this.lastThrow.result = res.message;
      // advance turn: in cricket we'll still allow 3-dart turns
      this.turnThrowCount += 1;
      if (this.turnThrowCount >= 3) {
        // commit end of turn: rotate
        this.turnThrowCount = 0;
        this.turnAccum = 0;
        this.nextTurn();
      }
      return { ok: true, state: this.getState(), message: res.message };
    }

    // STANDARD MODE logic with double-in/out etc.
    // If double-in active and player not opened yet, only opening check: if mult==2 -> open and points count from now
    if (this.doubleIn && !this.opened[playerId]) {
      if (m === 2) {
        this.opened[playerId] = true;
        // this throw ALSO counts as normal single/double/triple value for turnAccum
        this.turnAccum += val * m;
      } else {
        // if not double, doesn't open; counts as 0
        // still consumes throw
      }
      this.turnThrowCount += 1;
      this.lastThrow.result = "double_in_check";
      // if 3 throws used, commit (will subtract turnAccum — maybe zero)
      if (this.turnThrowCount >= 3) {
        // commit
        this._commitTurnForPlayer(playerId);
        this.nextTurn();
      }
      return { ok: true, state: this.getState(), message: "Double-in processed" };
    }

    // if opened or no double-in: accumulate the scored points (value * mult)
    const scored = val * m;
    this.turnAccum += scored;
    this.turnThrowCount += 1;
    // provisional check: prev - (turnAccum)
    const prev = this.scores[playerId] ?? this.startingScore;
    const provisional = prev - this.turnAccum;
    this.lastThrow.provisional = provisional;

    // immediate win possibility: if provisional === 0 and finish rules satisfied based on current throw
    if (provisional === 0) {
      // check finish rule using mult of current dart (m)
      if (this.finishType === "single_out") {
        this.scores[playerId] = 0;
        this.winner = playerId;
        this.lastThrow.result = "win";
        this.started = false;
        // reset turn counters
        this.turnThrowCount = 0;
        this.turnAccum = 0;
        return { ok: true, state: this.getState(), message: "Gewinner" };
      } else if (this.finishType === "double_out") {
        if (m === 2) {
          this.scores[playerId] = 0;
          this.winner = playerId;
          this.lastThrow.result = "win";
          this.started = false;
          this.turnThrowCount = 0;
          this.turnAccum = 0;
          return { ok: true, state: this.getState(), message: "Gewinner (double out)" };
        } else {
          // invalid finish -> bust immediate: revert to prev, end turn
          this.lastThrow.result = "bust_finish_invalid";
          this.turnAccum = 0;
          this.turnThrowCount = 0;
          this.nextTurn();
          return { ok: true, state: this.getState(), message: "Bust (invalid finish)" };
        }
      } else if (this.finishType === "master_out") {
        if (m === 2 || m === 3) {
          this.scores[playerId] = 0;
          this.winner = playerId;
          this.lastThrow.result = "win";
          this.started = false;
          this.turnThrowCount = 0;
          this.turnAccum = 0;
          return { ok: true, state: this.getState(), message: "Gewinner (master out)" };
        } else {
          // invalid finish -> bust
          this.lastThrow.result = "bust_finish_invalid";
          this.turnAccum = 0;
          this.turnThrowCount = 0;
          this.nextTurn();
          return { ok: true, state: this.getState(), message: "Bust (invalid finish)" };
        }
      } else {
        // default single_out
        this.scores[playerId] = 0;
        this.winner = playerId;
        this.lastThrow.result = "win";
        this.started = false;
        this.turnThrowCount = 0;
        this.turnAccum = 0;
        return { ok: true, state: this.getState(), message: "Gewinner" };
      }
    }

    // provisional < 0 => bust immediate: reset turn accumulators and advance turn
    if (provisional < 0) {
      this.lastThrow.result = "bust";
      this.turnAccum = 0;
      this.turnThrowCount = 0;
      this.nextTurn();
      return { ok: true, state: this.getState(), message: "Bust" };
    }

    // provisional > 0, but if used 3 throws, commit
    if (this.turnThrowCount >= 3) {
      // commit turnAcc to score
      this._commitTurnForPlayer(playerId);
      // if winner set inside commit, game ends; otherwise advance
      if (!this.winner) this.nextTurn();
      return { ok: true, state: this.getState(), message: "Turn committed" };
    }

    // otherwise mid-turn: do not advance
    this.lastThrow.result = "ok";
    return { ok: true, state: this.getState(), message: "Wurf angenommen" };
  }

  // advance turn helper: resets turn accumulators and index
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

  getState() {
    // Prepare cricket summary if needed
    const cricketSummary = {};
    if (this.mode === "cricket") {
      this.players.forEach(p => {
        cricketSummary[p] = {
          marks: { ...this.cricketMarks[p] },
          score: this.cricketScores[p] || 0
        };
      });
    }

    return {
      type: "game_state",
      roomId: this.roomId,
      mode: this.mode,
      started: this.started,
      players: this.players.slice(),
      scores: { ...this.scores },
      currentPlayerIndex: this.currentIndex,
      currentPlayer: this.players[this.currentIndex] ?? null,
      turnThrowCount: this.turnThrowCount,
      turnAccum: this.turnAccum,
      lastThrow: this.lastThrow,
      winner: this.winner,
      startingScore: this.startingScore,
      finishType: this.finishType,
      doubleIn: this.doubleIn,
      startChoice: this.startChoice,
      // cricket extras
      cricket: this.mode === "cricket" ? cricketSummary : null
    };
  }
}
