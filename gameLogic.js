// gameLogic.js

/**
 * Unterstützte Modi: mindestens "501-di" (501 double out)
 * Struktur eines Game-Objekts (simplifiziert):
 * {
 *   mode: "501-di",
 *   startingScore: 501,
 *   players: [ { id, name, score, legsWon }, ... ],
 *   currentPlayerIndex: 0,
 *   currentLegStartScores: { playerId: scoreAtStartOfLeg, ... } // für Bust-Rücksetzung
 * }
 */

/**
 * Erzeuge ein neues Spielobjekt.
 * @param {Array<{id:string, name:string}>} players
 * @param {string} mode - z.B. "501-di"
 */
export function createGame(players, mode = "501-di") {
  const startingScore = mode.startsWith("501") ? 501 : 301;
  const game = {
    mode,
    startingScore,
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      score: startingScore,
      legsWon: 0,
    })),
    currentPlayerIndex: 0,
    legStarterIndex: 0,
    inProgress: false,
    currentLegStartScores: {}, // filled when leg starts
  };

  // initial leg start snapshot
  for (const p of game.players) game.currentLegStartScores[p.id] = p.score;

  return game;
}

/**
 * Hilfsfunktion: prüft ob ein Wert als "double" gilt.
 * Eingabe: der tatsächliche Punktwert des letzten Darts (z.B. 40 für Double20).
 * Wir akzeptieren auch Bull (50) als gültiges Double-Finish.
 */
function isDoubleValue(v) {
  if (v === 50) return true; // bullseye (single bull is 25, bull is 50)
  return v % 2 === 0;
}

/**
 * handleThrow
 * @param {object} game - game object
 * @param {string} playerId
 * @param {number[]} darts - array mit bis zu 3 Treffern (z.B. [20, 60, 0])
 * @returns {object} update { success, busted, finished, playerScore, nextPlayerIndex, msgs[] }
 */
export function handleThrow(game, playerId, darts) {
  // find player index
  const pIndex = game.players.findIndex(p => p.id === playerId);
  if (pIndex === -1) return { success: false, message: "player not in game" };
  if (game.players[game.currentPlayerIndex].id !== playerId) {
    return { success: false, message: "not player's turn" };
  }

  // ensure darts array length <= 3
  darts = darts.slice(0, 3).map(d => Number(d) || 0);

  let player = game.players[pIndex];
  let remaining = player.score;
  const startingLegScore = game.currentLegStartScores[playerId] ?? player.score;

  let busted = false;
  let finished = false;
  const msgs = [];

  for (let i = 0; i < darts.length; i++) {
    const dart = darts[i];
    if (dart <= 0) {
      // skip zero-dart (miss)
      continue;
    }

    const newRemaining = remaining - dart;

    // immediate bust cases: negative or 1 (cannot finish on 1)
    if (newRemaining < 0 || newRemaining === 1) {
      busted = true;
      msgs.push(`Bust on dart ${i + 1} (scored ${dart}). remaining would be ${newRemaining}`);
      break;
    }

    // finished case: newRemaining === 0 -> check double-out if mode requires
    if (newRemaining === 0) {
      if (game.mode.endsWith("-di")) {
        // require last dart is double (or bull 50)
        if (!isDoubleValue(dart)) {
          busted = true;
          msgs.push(`Invalid finish (not double). Dart ${i + 1} scored ${dart}`);
          break;
        } else {
          // valid finish
          remaining = 0;
          finished = true;
          msgs.push(`Player finished with dart ${i + 1} (scored ${dart})`);
          break;
        }
      } else {
        // other modes (allow single-out)
        remaining = 0;
        finished = true;
        msgs.push(`Player finished with dart ${i + 1} (scored ${dart})`);
        break;
      }
    }

    // otherwise accept the throw and continue
    remaining = newRemaining;
  }

  if (busted) {
    // reset player's score to start of leg
    player.score = startingLegScore;
    // shift turn to next player
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    return {
      success: true,
      busted: true,
      finished: false,
      playerScore: player.score,
      nextPlayerIndex: game.currentPlayerIndex,
      msgs,
    };
  }

  // if finished
  if (finished) {
    player.score = 0;
    player.legsWon = (player.legsWon || 0) + 1;

    // prepare next leg: reset scores for all players
    for (const p of game.players) {
      p.score = game.startingScore;
      game.currentLegStartScores[p.id] = p.score;
    }

    // next leg starter toggles or stays (we set legStarterIndex)
    game.legStarterIndex = (game.legStarterIndex + 1) % game.players.length;
    game.currentPlayerIndex = game.legStarterIndex;

    return {
      success: true,
      busted: false,
      finished: true,
      playerScore: 0,
      legsWon: player.legsWon,
      nextPlayerIndex: game.currentPlayerIndex,
      msgs,
    };
  }

  // normal (no bust, no finish) -> commit remaining and shift turn
  player.score = remaining;
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;

  return {
    success: true,
    busted: false,
    finished: false,
    playerScore: player.score,
    nextPlayerIndex: game.currentPlayerIndex,
    msgs,
  };
}
