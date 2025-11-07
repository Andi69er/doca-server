// =======================================
// doca-webdarts / server/gameLogic.js
// Kernspiel-Engine für X01 Dartspiele
// =======================================

// Neues Spiel erzeugen
export function createNewGame(settings, players) {
  const startScore = parseInt(settings.startScore || 501);
  const starter = settings.starter || players[0].id;

  const playerState = (p) => ({
    id: p.id,
    name: p.name,
    score: startScore,
    legsWon: 0,
    setsWon: 0,
    dartsThrown: 0,
    lastScore: 0,
    checkdart: null,
  });

  const game = {
    mode: settings.mode || "first-to",        // "first-to" oder "best-of"
    legsToWin: parseInt(settings.legsToWin || 3),
    doubleOut: settings.doubleOut !== false,  // Standard: Double-Out aktiv
    startScore,
    currentPlayer: starter,
    legStarter: starter,
    players: players.map(playerState),
    inProgress: true,
    awaitingCheckdart: false,
    finished: false,
    winner: null,
  };
  return game;
}

// Punkte eintragen
export function applyScore(game, playerId, score) {
  if (!game.inProgress) return game;
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return game;

  score = parseInt(score);
  if (isNaN(score) || score < 0 || score > 180) return game;

  const remaining = player.score - score;
  player.lastScore = score;
  player.dartsThrown += 3;

  if (remaining < 0) {
    // Bust
    player.lastScore = "BUST";
  } else if (remaining === 1 && game.doubleOut) {
    // Bust (kein Double möglich)
    player.lastScore = "BUST";
  } else if (remaining === 0) {
    // Leg gewonnen
    player.score = 0;
    player.legsWon++;
    game.awaitingCheckdart = true;
    game.inProgress = false; // bis Checkdart erfasst
    game.winner = player.id;
  } else {
    // normaler Wurf
    player.score = remaining;
    nextPlayer(game);
  }

  return game;
}

// Checkdart erfassen (nach Leggewinn)
export function recordCheckdart(game, playerId, dartsUsed) {
  const player = game.players.find((p) => p.id === playerId);
  if (player) player.checkdart = parseInt(dartsUsed) || 3;
  game.awaitingCheckdart = false;
  game.inProgress = true;
  nextLeg(game);
  return game;
}

// Nächstes Leg starten
function nextLeg(game) {
  const startScore = game.startScore;
  for (const p of game.players) {
    p.score = startScore;
    p.dartsThrown = 0;
    p.lastScore = 0;
    p.checkdart = null;
  }
  // Starter wechselt
  game.legStarter =
    game.legStarter === game.players[0].id
      ? game.players[1].id
      : game.players[0].id;
  game.currentPlayer = game.legStarter;
  game.inProgress = true;
  game.awaitingCheckdart = false;
}

// Spielerwechsel
function nextPlayer(game) {
  const idx = game.players.findIndex((p) => p.id === game.currentPlayer);
  const nextIdx = (idx + 1) % game.players.length;
  game.currentPlayer = game.players[nextIdx].id;
}

// Spiel abbrechen
export function abortGame(game) {
  game.inProgress = false;
  game.finished = true;
  return game;
}

// Status für Übertragung
export function serializeGame(game) {
  return JSON.parse(JSON.stringify(game));
}
