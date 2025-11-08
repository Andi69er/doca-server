// gameLogic.js
// DOCA WebDarts PRO - erweiterte Spielengine
// - Standard (301..1001), Cricket
// - Finish rules: single_out, double_out, master_out
// - Double-In (DI)
// - 3-dart turns (turnThrowCount, turnAccum)
// - Ausbullen (pre-start bulling)
// - Undo support via snapshots
// - Throws accept {value, mult} where mult=1(S)/2(D)/3(T)
// - History/snapshots: push before each throw for undo

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export class Game {
  constructor(roomId, players = [], options = {}) {
    this.roomId = roomId;
    this.options = {
      startingScore: Number(options.startingScore) || 501,
      variant: options.variant || "standard", // standard|cricket
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
    this.opened = {}; // for DI
    this.currentIndex = 0;
    this.started = false;
    this.winner = null;

    // turn tracking
    this.turnThrowCount = 0; // 0..3
    this.turnAccum = 0;
    this.turnPlayer = null;
    this.lastThrow = null;

    // snapshots for undo (store state before each throw)
    this.snapshots = [];

    // bulling (pre-start) for startChoice 'bull'
    this.bulling = (this.startChoice === "bull");
    this.bullShots = {}; // clientId -> score (25 or 50)

    // cricket
    this.cricketTargets = [20,19,18,17,16,15,25]; // 25 = bull
    this.cricketMarks = {}; // playerId -> {target: marks}
    this.cricketScores = {}; // points from extra hits

    this.history = []; // optional action log

    // init
    this.players.forEach(p => {
      this.scores[p] = this.startingScore;
      this.opened[p] = !this.doubleIn;
      this.cricketMarks[p] = {};
      this.cricketTargets.forEach(t => this.cricketMarks[p][t] = 0);
      this.cricketScores[p] = 0;
    });
    this.turnPlayer = this.players[this.currentIndex] || null;
  }

  // snapshot helper
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
      winner: this.winner
    };
    this.snapshots.push(snap);
    // limit snapshot size to avoid memory overflow (keep last 50)
    if (this.snapshots.length > 50) this.snapshots.shift();
  }

  // undo last throw if allowed (caller must be same player who made last throw and it's still same turn)
  undoLastThrow(requestingClientId) {
    if (!this.snapshots || this.snapshots.length === 0) return { ok: false, message: "Keine Aktion zum Rückgängig machen" };

    const lastSnap = this.snapshots[this.snapshots.length - 1];
    // The snapshot was taken BEFORE the last throw. We need to ensure lastThrow exists and belongs to requestingClientId.
    const lastThrow = this.lastThrow;
    if (!lastThrow) return { ok: false, message: "Kein letzter Wurf vorhanden" };
    if (lastThrow.playerId !== requestingClientId) return { ok: false, message: "Nur der wer den letzten Wurf machte kann undo" };

    // restore snapshot
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

    // record history
    this.history.push({ type: "undo", by: requestingClientId, at: Date.now() });

    return { ok: true, state: this.getState(), message: "Undo erfolgreich" };
  }

  // Decide starting player based on startChoice and optionally caller
  decideStarter(callerId = null) {
    if (this.options.startChoice === "first") {
      if (callerId) {
        const i = this.players.indexOf(callerId);
        this.currentIndex = i !== -1 ? i : 0;
      } else this.currentIndex = 0;
      return;
    }
    if (this.options.startChoice === "second") {
      if (callerId) {
        const i = this.players.indexOf(callerId);
        this.currentIndex = i === -1 ? 1 % this.players.length : (i + 1) % this.players.length;
      } else this.currentIndex = 1 % this.players.length;
      return;
    }
    if (this.options.startChoice === "bull") {
      // if bulling mode, currentIndex will be set after both bull_shots are in
      // keep currentIndex as 0 default until bulling done
      this.currentIndex = 0;
      return;
    }
    this.currentIndex = 0;
  }

  start(callerId = null) {
    // if startChoice == bull and bulling not finished, enter bulling mode
    this.decideStarter(callerId);
    this.started = true;
    this.winner = null;
    this.lastThrow = null;
    this.turnThrowCount = 0;
    this.turnAccum = 0;
    this.turnPlayer = this.players[this.currentIndex] || null;
    this.snapshots = [];
    this.history = [];
    // reset scores/opened/cricket
    this.players.forEach(p => {
      this.scores[p] = this.startingScore;
      this.opened[p] = !this.doubleIn;
      this.cricketTargets.forEach(t => this.cricketMarks[p][t] = 0);
      this.cricketScores[p] = 0;
    });
    // bulling: if startChoice is bull, we set started=false until bulling complete.
    if (this.options.startChoice === "bull") {
      this.bulling = true;
      this.started = false;
      this.bullShots = {};
      // still return state showing bulling active
    } else {
      this.bulling = false;
    }
    return this.getState();
  }

  addPlayer(clientId) {
    if (!this.players.includes(clientId)) {
      this.players.push(clientId);
      this.scores[clientId] = this.startingScore;
      this.opened[clientId] = !this.doubleIn;
      this.cricketMarks[clientId] = {};
      this.cricketTargets.forEach(t => this.cricketMarks[clientId][t] = 0);
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

  // helper normalize multiplier
  _normMult(m) {
    const mm = Number(m) || 1;
    if (mm !== 1 && mm !== 2 && mm !== 3) return 1;
    return mm;
  }

  // next turn helper
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

  // Cricket single dart handler
  _handleCricketThrow(playerId, value, mult) {
    const t = Number(value);
    if (!this.cricketTargets.includes(t)) {
      return { ok: false, message: "Kein Cricket-Target" };
    }
    const hitsToAdd = this._normMult(mult);
    const before = this.cricketMarks[playerId][t] || 0;
    const total = before + hitsToAdd;
    const added = Math.max(0, Math.min(3, total) - before);
    this.cricketMarks[playerId][t] = Math.min(3, total);

    // extra points if total >3 and opponents not yet closed
    const extra = Math.max(0, total - 3);
    if (extra > 0) {
      const valuePoints = (t === 25 ? 25 : t);
      this.cricketScores[playerId] += extra * valuePoints;
    }

    // check for win: closed all and highest/equal points
    const playerClosedAll = this.cricketTargets.every(tt => this.cricketMarks[playerId][tt] >= 3);
    if (playerClosedAll) {
      const othersClosed = this.players.every(p => this.cricketTargets.every(tt => this.cricketMarks[p][tt] >= 3));
      if (othersClosed) {
        const myScore = this.cricketScores[playerId] || 0;
        const maxOther = Math.max(...this.players.filter(p => p !== playerId).map(p => this.cricketScores[p] || 0), 0);
        if (myScore >= maxOther) {
          this.winner = playerId;
          this.started = false;
          return { ok: true, message: "Cricket winner" };
        }
      }
    }

    return { ok: true, message: "Cricket hit" };
  }

  // commit turn for standard mode (apply turnAccum to player's score and check finish rules)
  _commitTurnForPlayer(pid) {
    const prev = this.scores[pid] ?? this.startingScore;
    const newScore = prev - this.turnAccum;
    if (newScore < 0) {
      // bust -> revert
    } else {
      // normal commit
      this.scores[pid] = newScore;
      if (newScore === 0) {
        // finish validation based on lastThrow.mult
        const lastMult = this.lastThrow?.mult || 1;
        if (this.finishType === "single_out") {
          this.winner = pid;
        } else if (this.finishType === "double_out") {
          if (lastMult === 2) this.winner = pid;
          else this.scores[pid] = prev; // invalid finish -> revert
        } else if (this.finishType === "master_out") {
          if (lastMult === 2 || lastMult === 3) this.winner = pid;
          else this.scores[pid] = prev;
        } else {
          this.winner = pid;
        }
      }
    }
    this.turnAccum = 0;
    this.turnThrowCount = 0;
  }

  // handle incoming bull_shot when in bulling mode before start
  handleBullShot(clientId, mult) {
    if (!this.bulling) return { ok: false, message: "Bulling nicht aktiv" };
    // accept mult 1 (outer bull 25) or 2 (inner bull 50)
    const m = this._normMult(mult);
    const bullScore = (m === 2 ? 50 : 25);
    this.bullShots[clientId] = bullScore;
    // check if all players submitted
    if (this.players.length > 0 && Object.keys(this.bullShots).length >= this.players.length) {
      // decide highest bullShot wins; if tie, redo (clear bullShots and notify)
      const entries = Object.entries(this.bullShots);
      const max = Math.max(...entries.map(e => e[1]));
      const winners = entries.filter(e => e[1] === max).map(e => e[0]);
      if (winners.length === 1) {
        // set currentIndex to winner index
        const winnerId = winners[0];
        const idx = this.players.indexOf(winnerId);
        if (idx !== -1) this.currentIndex = idx;
        this.bulling = false;
        this.started = true;
        this.turnPlayer = this.players[this.currentIndex];
        this.bullShots = {};
        return { ok: true, state: this.getState(), message: `Bulling entschieden: ${winnerId}` };
      } else {
        // tie: clear and request new bulling round
        this.bullShots = {};
        return { ok: true, state: this.getState(), message: "Bulling Unentschieden - Repeat" };
      }
    }
    return { ok: true, state: this.getState(), message: "Bull shot aufgenommen" };
  }

  // Main throw entrypoint: expects playerId, value (number), mult (1|2|3)
  playerThrow(playerId, value, mult = 1) {
    if (this.bulling) return { ok: false, message: "Bulling läuft - sende bull_shot" };
    if (!this.started) return { ok: false, message: "Spiel läuft nicht" };
    if (this.winner) return { ok: false, message: "Spiel bereits beendet" };
    if (this.turnPlayer !== playerId) return { ok: false, message: "Nicht dein Zug" };

    const m = this._normMult(mult);
    const val = Number(value) || 0;

    // before processing, push snapshot for undo
    this.pushSnapshot();

    // lastThrow skeleton
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
      // cricket: process immediately
      const res = this._handleCricketThrow(playerId, val, m);
      this.lastThrow.result = res.message;
      this.turnThrowCount += 1;
      // end of turn if 3 throws used
      if (this.turnThrowCount >= 3) {
        this.turnThrowCount = 0;
        this.turnAccum = 0;
        this.nextTurn();
      }
      this.history.push({ type: "throw", playerId, value: val, mult: m, mode: "cricket", at: Date.now() });
      return { ok: true, state: this.getState(), message: res.message };
    }

    // STANDARD mode
    // if DI enabled and not opened -> only opening check when mult==2 (double), else no points
    if (this.doubleIn && !this.opened[playerId]) {
      if (m === 2) {
        this.opened[playerId] = true;
        this.turnAccum += val * m;
        this.lastThrow.result = "double_in_open";
      } else {
        // not opened yet, throw counts as zero
        this.lastThrow.result = "double_in_miss";
      }
      this.turnThrowCount += 1;
      // immediate commit on 3 throws
      if (this.turnThrowCount >= 3) {
        this._commitTurnForPlayer(playerId);
        // if winner set, game ends; else next turn
        if (!this.winner) this.nextTurn();
      }
      this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now() });
      return { ok: true, state: this.getState(), message: this.lastThrow.result };
    }

    // otherwise accumulate scored points
    const scored = val * m;
    this.turnAccum += scored;
    this.turnThrowCount += 1;
    const prev = this.scores[playerId];
    const provisional = prev - this.turnAccum;
    this.lastThrow.provisional = provisional;

    // immediate win check (if provisional === 0) - evaluate finish rules based on current dart mult
    if (provisional === 0) {
      if (this.finishType === "single_out") {
        this.scores[playerId] = 0;
        this.winner = playerId;
        this.lastThrow.result = "win";
        this.started = false;
        this.turnThrowCount = 0;
        this.turnAccum = 0;
        this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now(), result: "win" });
        return { ok: true, state: this.getState(), message: "Gewinner" };
      } else if (this.finishType === "double_out") {
        if (m === 2) {
          this.scores[playerId] = 0;
          this.winner = playerId;
          this.lastThrow.result = "win";
          this.started = false;
          this.turnThrowCount = 0;
          this.turnAccum = 0;
          this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now(), result: "win" });
          return { ok: true, state: this.getState(), message: "Gewinner (double out)" };
        } else {
          // invalid finish => bust
          this.lastThrow.result = "bust_invalid_finish";
          this.turnAccum = 0;
          this.turnThrowCount = 0;
          this.nextTurn();
          this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now(), result: "bust_invalid_finish" });
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
          this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now(), result: "win" });
          return { ok: true, state: this.getState(), message: "Gewinner (master out)" };
        } else {
          this.lastThrow.result = "bust_invalid_finish";
          this.turnAccum = 0;
          this.turnThrowCount = 0;
          this.nextTurn();
          this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now(), result: "bust_invalid_finish" });
          return { ok: true, state: this.getState(), message: "Bust (invalid finish)" };
        }
      } else {
        // fallback single_out
        this.scores[playerId] = 0;
        this.winner = playerId;
        this.lastThrow.result = "win";
        this.started = false;
        this.turnThrowCount = 0;
        this.turnAccum = 0;
        this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now(), result: "win" });
        return { ok: true, state: this.getState(), message: "Gewinner" };
      }
    }

    // provisional < 0 => bust immediate
    if (provisional < 0) {
      this.lastThrow.result = "bust";
      this.turnAccum = 0;
      this.turnThrowCount = 0;
      this.nextTurn();
      this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now(), result: "bust" });
      return { ok: true, state: this.getState(), message: "Bust" };
    }

    // provisional > 0; if 3 throws used, commit
    if (this.turnThrowCount >= 3) {
      this._commitTurnForPlayer(playerId);
      if (!this.winner) this.nextTurn();
      this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now(), result: "commit" });
      return { ok: true, state: this.getState(), message: "Turn committed" };
    }

    // mid-turn accepted
    this.lastThrow.result = "ok";
    this.history.push({ type: "throw", playerId, value: val, mult: m, at: Date.now(), result: "ok" });
    return { ok: true, state: this.getState(), message: "Wurf angenommen" };
  }

  // handle bull_shot during bulling phase
  bullShot(clientId, mult = 1) {
    if (!this.bulling) return { ok: false, message: "Bulling nicht aktiv" };
    const m = this._normMult(mult);
    const score = (m === 2 ? 50 : 25);
    this.bullShots[clientId] = score;
    this.history.push({ type: "bull", clientId, score, at: Date.now() });

    // if all players submitted, decide
    if (Object.keys(this.bullShots).length >= this.players.length) {
      const entries = Object.entries(this.bullShots);
      const max = Math.max(...entries.map(e => e[1]));
      const winners = entries.filter(e => e[1] === max).map(e => e[0]);
      if (winners.length === 1) {
        const winnerId = winners[0];
        const idx = this.players.indexOf(winnerId);
        if (idx !== -1) this.currentIndex = idx;
        this.bulling = false;
        this.started = true;
        this.turnPlayer = this.players[this.currentIndex];
        this.bullShots = {};
        return { ok: true, state: this.getState(), message: `Bulling entschieden: ${winnerId}` };
      } else {
        // tie -> clear and request repeat
        this.bullShots = {};
        return { ok: true, state: this.getState(), message: "Bulling Unentschieden - wiederhole" };
      }
    }
    return { ok: true, state: this.getState(), message: "Bull registriert" };
  }

  getState() {
    const cricketSummary = {};
    if (this.mode === "cricket") {
      this.players.forEach(p => {
        cricketSummary[p] = {
          marks: deepCopy(this.cricketMarks[p]),
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
      scores: deepCopy(this.scores),
      currentPlayerIndex: this.currentIndex,
      currentPlayer: this.players[this.currentIndex] ?? null,
      turnThrowCount: this.turnThrowCount,
      turnAccum: this.turnAccum,
      lastThrow: deepCopy(this.lastThrow),
      winner: this.winner,
      startingScore: this.startingScore,
      finishType: this.finishType,
      doubleIn: this.doubleIn,
      startChoice: this.startChoice,
      bulling: this.bulling,
      cricket: this.mode === "cricket" ? cricketSummary : null
    };
  }
}
