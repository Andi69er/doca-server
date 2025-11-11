// ======================================================
// Spiel-Logik (DOCA WebDarts PRO)
// ======================================================

import { getRoomByClientId } from "./roomManager.js";
import { broadcastToPlayers } from "./userManager.js";

export function handleGameMessage(clientId, data) {
  const room = getRoomByClientId(clientId);
  if (!room) return;

  switch (data.action) {
    case "start_game":
      startGame(room);
      break;

    case "throw":
      handleThrow(room, clientId, data.score);
      break;

    default:
      broadcastToPlayers(room.players, data);
  }
}

function startGame(room) {
  room.game = {
    active: true,
    scores: {},
    startTime: Date.now(),
  };

  room.players.forEach((pid) => (room.game.scores[pid] = 501));

  broadcastToPlayers(room.players, {
    type: "game_started",
    scores: room.game.scores,
  });
}

function handleThrow(room, clientId, score) {
  if (!room.game?.active) return;

  const newScore = Math.max(0, (room.game.scores[clientId] ?? 501) - score);
  room.game.scores[clientId] = newScore;

  broadcastToPlayers(room.players, {
    type: "score_update",
    player: clientId,
    score: newScore,
  });

  if (newScore === 0) {
    room.game.active = false;
    broadcastToPlayers(room.players, {
      type: "game_won",
      winner: clientId,
    });
  }
}
