// ===========================================
// DOCA WebDarts – X01 Game Logic (501 Double Out)
// ===========================================
//
// Diese Logik läuft serverseitig und wird vom roomManager.js aufgerufen.
// Unterstützt aktuell 501 Double Out, kann später leicht auf 301/701/Cricket erweitert werden.
//

import WebSocket from "ws";

export class GameLogic {
  constructor(roomId, players) {
    this.roomId = roomId;
    this.players = players.map((p) => ({
      ...p,
      score: 501,
      lastScore: 0,
      dartsThisTurn: [],
    }));
    this.currentIndex = 0; // welcher Spieler ist dran
    this.state = "playing"; // playing | finished
  }

  // ===========================================
  // Handle Dart Throw
  // ===========================================
  handleThrow(ws, data) {
    const player = this.players[this.currentIndex];
    if (player.ws !== ws) return; // falscher Spieler

    const { value, multiplier } = data;
    const hit = value * multiplier;

    player.dartsThisTurn.push({ value, multiplier, hit });

    const newScore = player.score - hit;

    // Bust? (Score < 0 oder 1)
    if (newScore < 0 || newScore === 1) {
      this.broadcast({
        type: "info",
        message: `💥 Bust! Kein Score für ${player.username}.`,
      });
      player.dartsThisTurn = [];
      this.nextPlayer();
      return;
    }

    // Check Double Out
    if (newScore === 0 && multiplier === 2) {
      player.score = 0;
      this.state = "finished";
      this.broadcast({
        type: "game_finished",
        message: `🏆 ${player.username} gewinnt mit einem Double Out!`,
        winner: player.username,
      });
      return;
    }

    // Normaler Treffer
    player.score = newScore;
    player.lastScore = hit;

    // Wenn 3 Darts geworfen -> Nächster Spieler
    if (player.dartsThisTurn.length >= 3) {
      player.dartsThisTurn = [];
      this.nextPlayer();
    } else {
      this.updateClients();
    }
  }

  // ===========================================
  // Nächster Spieler
  // ===========================================
  nextPlayer() {
    this.currentIndex = (this.currentIndex + 1) % this.players.length;
    const next = this.players[this.currentIndex];
    this.updateClients();
    this.broadcast({
      type: "info",
      message: `🎯 Jetzt am Zug: ${next.username}`,
    });
  }

  // ===========================================
  // Broadcast aktueller Spielstand
  // ===========================================
  updateClients() {
    const gameState = {
      type: "game_update",
      roomId: this.roomId,
      players: this.players.map((p) => ({
        username: p.username,
        score: p.score,
        lastScore: p.lastScore,
      })),
      currentPlayer: this.players[this.currentIndex].username,
    };

    this.broadcast(gameState);
  }

  // ===========================================
  // Nachricht an alle Spieler
  // ===========================================
  broadcast(obj) {
    for (const p of this.players) {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify(obj));
      }
    }
  }
}
