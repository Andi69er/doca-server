// gameLogic.js – finale Version (kompatibel mit allen UI-Optionen)

export function startGame(players, opts) {
  const {
    startingScore = 501,
    variant = "standard",
    finishType = "double_out",
    doubleIn = false,
    startChoice = "first",
  } = opts;

  const state = {
    players,
    startingScore,
    scores: Object.fromEntries(players.map((p) => [p, startingScore])),
    opened: Object.fromEntries(players.map((p) => [p, !doubleIn])),
    variant,
    finishType,
    doubleIn,
    mode: variant,
    bulling: startChoice === "bull",
    started: startChoice !== "bull",
    currentPlayer:
      startChoice === "second"
        ? players[1 % players.length]
        : players[0],
    turnThrowCount: 0,
    turnAccum: 0,
    lastThrow: null,
    winner: null,
  };

  if (variant === "cricket") {
    state.cricket = {};
    players.forEach((p) => {
      state.cricket[p] = {
        marks: { 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0, 25: 0 },
        score: 0,
      };
    });
  }

  return state;
}

export function handleBull(state, playerId, mult) {
  if (!state.bulling) return state;

  state.bulling = false;
  state.started = true;
  state.currentPlayer = mult === 2 ? playerId : state.players.find((p) => p !== playerId);
  state.lastThrow = { playerId, value: 25, mult, result: "Bulling-Wurf" };

  return state;
}

export function handleThrow(state, playerId, value, mult) {
  if (state.winner || !state.started || playerId !== state.currentPlayer)
    return state;

  state.lastThrow = { playerId, value, mult, result: "" };
  state.turnThrowCount++;
  const total = value * mult;

  // Cricket-Modus
  if (state.variant === "cricket") {
    const valid = [15, 16, 17, 18, 19, 20, 25];
    if (!valid.includes(value)) {
      state.lastThrow.result = "Kein Treffer (Cricket)";
      nextPlayer(state);
      return state;
    }

    const myMarks = state.cricket[playerId].marks;
    const otherId = state.players.find((p) => p !== playerId);
    const oppMarks = state.cricket[otherId].marks;

    const prev = myMarks[value];
    myMarks[value] = Math.min(prev + mult, 3);

    if (prev >= 3) {
      state.cricket[playerId].score += value * mult;
      state.lastThrow.result = `Extra-Punkte ${value * mult}`;
    } else if (myMarks[value] === 3 && oppMarks[value] < 3) {
      state.lastThrow.result = `Nummer ${value} geschlossen`;
    }

    const closedAll = Object.values(myMarks).every((m) => m >= 3);
    const myScore = state.cricket[playerId].score;
    const otherScore = state.cricket[otherId].score;
    if (closedAll && myScore >= otherScore) {
      state.winner = playerId;
      state.lastThrow.result = "Spiel gewonnen!";
    }
    nextPlayer(state);
    return state;
  }

  // 501/301 Modus
  if (state.doubleIn && !state.opened[playerId]) {
    if (mult === 2) {
      state.opened[playerId] = true;
      state.lastThrow.result = "Double-In geöffnet";
    } else {
      state.lastThrow.result = "Nicht geöffnet (Double-In)";
      nextPlayer(state);
      return state;
    }
  }

  const newScore = state.scores[playerId] - total;
  const finish = newScore === 0;

  // Double-Out-Logik
  if (finish) {
    if (
      state.finishType === "single_out" ||
      (state.finishType === "double_out" && mult === 2) ||
      (state.finishType === "master_out" && (mult === 2 || mult === 3))
    ) {
      state.scores[playerId] = 0;
      state.winner = playerId;
      state.lastThrow.result = "Checkout!";
      return state;
    } else {
      state.lastThrow.result = "Falscher Checkout";
      nextPlayer(state);
      return state;
    }
  }

  if (newScore < 0) {
    state.lastThrow.result = "Bust!";
    nextPlayer(state);
    return state;
  }

  state.scores[playerId] = newScore;
  state.lastThrow.result = `${total} Punkte`;
  if (state.turnThrowCount >= 3) nextPlayer(state);
  return state;
}

export function handleUndo(state, playerId) {
  // Simple: let previous player back on turn
  const prev = state.players.find((p) => p !== playerId);
  state.currentPlayer = prev;
  state.lastThrow = { playerId, value: 0, mult: 0, result: "Undo" };
  return state;
}

function nextPlayer(state) {
  state.turnThrowCount = 0;
  state.turnAccum = 0;
  const idx = state.players.indexOf(state.currentPlayer);
  const nextIdx = (idx + 1) % state.players.length;
  state.currentPlayer = state.players[nextIdx];
}
