// ===========================================
// DOCA WebDarts - Raum- & Spielverwaltung
// (mit integrierter 501 Double Out Game Logic)
// ===========================================

import WebSocket from "ws";
import { GameLogic } from "./gameLogic.js";

// ===============================
// Hilfsfunktionen
// ===============================
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(room, obj) {
  for (const player of room.players) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(obj));
    }
  }
}

// ===============================
// Raumverwaltung
// ===============================
class RoomManager {
  constructor() {
    this.rooms = new Map(); // key = roomId, value = {id, players[], state, game}
    this.nextRoomId = 1;
  }

  // Haupt-Einstieg für eingehende WS-Nachrichten
  handleMessage(ws, data) {
    switch (data.type) {
      case "join_room":
        this.joinRoom(ws, data);
        break;

      case "throw":
        this.handleThrow(ws, data);
        break;

      case "score":
        this.handleScore(ws, data);
        break;

      default:
        console.log("⚠️ Unbekannte Nachricht:", data);
    }
  }

  // ===================================
  // Spieler tritt einem Raum bei
  // ===================================
  joinRoom(ws, data) {
    const username = data.user || "Unbekannt";
    let room = this.findOpenRoom();

    if (!room) {
      // neuen Raum erstellen
      room = {
        id: this.nextRoomId++,
        players: [],
        state: "waiting",
        game: null,
      };
      this.rooms.set(room.id, room);
      console.log(`🆕 Neuer Raum #${room.id} erstellt.`);
    }

    // Spieler hinzufügen
    room.players.push({ ws, username });
    console.log(`👤 ${username} ist Raum #${room.id} beigetreten.`);

    broadcast(room, {
      type: "info",
      message: `🎯 ${username} ist dem Raum #${room.id} beigetreten.`,
    });

    // Wenn zwei Spieler da sind → Spiel starten
    if (room.players.length === 2) {
      room.state = "playing";
      room.game = new GameLogic(room.id, room.players);

      room.game.broadcast({
        type: "info",
        message: `🏁 Spiel startet zwischen ${room.players[0].username} und ${room.players[1].username}!`,
      });

      room.game.updateClients();
    }
  }

  // ===================================
  // Freien Raum suchen
  // ===================================
  findOpenRoom() {
    for (const room of this.rooms.values()) {
      if (room.state === "waiting" && room.players.length < 2) {
        return room;
      }
    }
    return null;
  }

  // ===================================
  // Dartwurf behandeln
  // ===================================
  handleThrow(ws, data) {
    const room = this.findRoomByWs(ws);
    if (!room || !room.game) return;
    room.game.handleThrow(ws, data);
  }

  // ===================================
  // Score manuell aktualisieren (Reserve)
  // ===================================
  handleScore(ws, data) {
    const room = this.findRoomByWs(ws);
    if (!room) return;

    broadcast(room, {
      type: "score_update",
      scores: data.scores,
    });
  }

  // ===================================
  // Raum eines Spielers finden
  // ===================================
  findRoomByWs(ws) {
    for (const room of this.rooms.values()) {
      for (const p of room.players) {
        if (p.ws === ws) return room;
      }
    }
    return null;
  }

  // ===================================
  // Spieler entfernen
  // ===================================
  removePlayer(ws) {
    for (const room of this.rooms.values()) {
      room.players = room.players.filter((p) => p.ws !== ws);
      if (room.players.length === 0) {
        this.rooms.delete(room.id);
        console.log(`🗑️ Raum #${room.id} gelöscht (leer).`);
      }
    }
  }
}

export const roomManager = new RoomManager();
