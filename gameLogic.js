// ===========================================
// gameLogic.js — einfache 501 Spiel-Engine (Server)
// - basic support for 501, doubles-in/doubles-out optional
// - provides onUpdate(payload) and onEnd(payload) callbacks
// ===========================================

/*
Simple architecture:
- createGameInstance(players, settings)
- returned object:
  - start()
  - playerThrow(playerKey, payload)
  - playerScore(playerKey, payload)
  - destroy()
  - onUpdate(payload)  // assignable
  - onEnd(payload)
*/

export function createGameInstance(players = [], settings = {}) {
  // settings: { startScore:501, doubleOut:true, doubleIn:false, legCount:1 }
  const cfg = Object.assign({ startScore: 501, doubleOut: true, doubleIn: false, legCount: 1 }, settings);

  // internal state
  const state = {
    players: players.map((p) => ({
      id: p.id,
      username: p.username,
      score: cfg.startScore,
      dartsThisTurn: [],
      finished: false,
    })),
    currentIndex: 0,
    started: false,
    legsToWin: cfg.legCount,
    legsWon: new Map(), // username -> legs
  };

  let destroyed = false;

  // callbacks
  let onUpdate = (payload) => {};
  let onEnd = (payload) => {};

  function emitUpdate() {
    if (destroyed) return;
    const payload = {
      players: state.players.map(p => ({ id: p.id, username: p.username, score: p.score })),
      current: state.players[state.currentIndex].username,
      started: state.started
    };
    onUpdate(payload);
  }

  function emitEnd(winner) {
    if (destroyed) return;
    onEnd({ winner });
  }

  function start() {
    if (destroyed) return;
    state.started = true;
    state.currentIndex = 0;
    players.forEach(p => state.legsWon.set(p.username, 0));
    emitUpdate();
  }

  function findPlayerByKey(playerKey) {
    // playerKey might be id or username
    return state.players.find(p => p.id == playerKey || p.username === playerKey);
  }

  function nextPlayer() {
    state.currentIndex = (state.currentIndex + 1) % state.players.length;
  }

  function playerThrow(playerKey, data) {
    if (destroyed) return;
    const p = findPlayerByKey(playerKey);
    if (!p) return;

    // data could be: { segment:20, multiplier:3 } or { value:60 }
    let value = 0;
    if (data && typeof data.value === "number") {
      value = data.value;
    } else if (data && typeof data.segment === "number") {
      const mul = Number(data.multiplier) || 1;
      value = data.segment * mul;
    } else {
      return;
    }

    // append dart
    p.dartsThisTurn.push(value);

    // if 3 darts thrown -> commit turn
    if (p.dartsThisTurn.length >= 3) {
      commitTurn(p);
    } else {
      emitUpdate();
    }
  }

  function commitTurn(p) {
    const turnTotal = p.dartsThisTurn.reduce((a,b)=>a+b,0);
    const newScore = p.score - turnTotal;

    // bust or finish rules
    let busted = false;
    let finished = false;

    if (newScore < 0) {
      busted = true;
    } else if (newScore === 0) {
      // check double-out rule: for simplification assume last dart must be double if doubleOut is true
      if (cfg.doubleOut) {
        // naive: if last dart value is even and <=40 treat as double -> passes
        const last = p.dartsThisTurn[p.dartsThisTurn.length -1];
        if (last % 2 === 0) {
          finished = true;
        } else {
          busted = true;
        }
      } else {
        finished = true;
      }
    }

    if (busted) {
      // revert to previous score, clear darts
      p.dartsThisTurn = [];
      // next player
      nextPlayer();
    } else {
      p.score = newScore;
      p.dartsThisTurn = [];
      if (finished) {
        // mark leg win
        const winner = p.username;
        const prev = state.legsWon.get(winner) || 0;
        state.legsWon.set(winner, prev + 1);

        // check match end
        if (state.legsWon.get(winner) >= state.legsToWin) {
          // match over
          emitUpdate();
          emitEnd({ winner, legs: state.legsWon.get(winner) });
          return;
        } else {
          // reset scores for new leg
          state.players.forEach(pl => { pl.score = cfg.startScore; pl.dartsThisTurn = []; });
        }
      } else {
        nextPlayer();
      }
    }

    emitUpdate();
  }

  function playerScore(playerKey, data) {
    // In case a client wants to submit final score or correction
    const p = findPlayerByKey(playerKey);
    if (!p) return;
    if (data && typeof data.score === "number") {
      p.score = data.score;
      emitUpdate();
    }
  }

  function destroy() {
    destroyed = true;
  }

  return {
    start,
    playerThrow,
    playerScore,
    destroy,
    get state() { return JSON.parse(JSON.stringify(state)); },
    // allow attaching callbacks
    set onUpdate(cb) { if (typeof cb === "function") onUpdate = cb; },
    set onEnd(cb) { if (typeof cb === "function") onEnd = cb; },
    // also expose config for debugging
    config: cfg
  };
}
