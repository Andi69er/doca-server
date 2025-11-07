// ===========================================
// DOCA WebDarts - Raum- & Spielverwaltung
// ===========================================

import WebSocket from "ws";

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
    this.rooms = new Map(); // key = roomId, value = {id, players[], state}
    this.nextRoomId = 1;
  }

  // Spieler will einem Raum beitreten oder neuen erstellen
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
        console.log("⚠️ Unbekannte RoomManager-Nachricht:", data);
    }
  }

  // ===================================
  // Raum finden oder erstellen
  // ===================================
  joinRoom(ws, data) {
    const username = data.user || "Unbekannt";
    let room = this.findOpenRoom();

    if (!room) {
      // neuen Raum erstellen
      room = {
        id: this.nextRoomId++,
        players: [],
        state: "waiting", // waiting | playing | finished
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

    // Wenn zwei Spieler im Raum -> Spiel starten
    if (room.players.length === 2) {
      room.state = "playing";
      broadcast(room, {
        type: "start_game",
        message: `🏁 Spiel startet zwischen ${room.players[0].username} und ${room.players[1].username}!`,
        players: room.players.map((p) => p.username),
      });
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
  // Wurf / Score behandeln
  // ===================================
  handleThrow(ws, data) {
    const room = this.findRoomByWs(ws);
    if (!room) return;

    broadcast(room, {
      type: "throw",
      player: data.user,
      value: data.value,
    });
  }

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
