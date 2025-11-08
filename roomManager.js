// ===========================================
// roomManager.js — Raumverwaltung & Game-Controller (Server)
// Vollständig, einsatzbereit
// ===========================================

import { createGameInstance } from "./gameLogic.js";

/*
Structure:
rooms: Map<roomId, {
  id,
  name,
  players: Map<ws, {id, username}>,
  game: GameInstance|null
}>
*/

export const roomManager = {
  rooms: new Map(),
  nextRoomId: 1,

  // Handle incoming messages assigned to room/game functionality
  handleMessage(ws, data) {
    try {
      switch (data.type) {
        case "join_room":
          return this.joinRoom(ws, data.room || `room-${this.nextRoomId}`);
        case "leave_room":
          return this.leaveRoom(ws, data.room);
        case "start_game":
          return this.startGame(ws, data.room, data.settings || {});
        case "throw":
          return this.playerThrow(ws, data);
        case "score":
          return this.playerScore(ws, data);
        default:
          console.log("roomManager: unbekannter Typ", data);
      }
    } catch (e) {
      console.error("roomManager.handleMessage Fehler:", e);
    }
  },

  createRoom(name) {
    const id = `r${this.nextRoomId++}`;
    const room = { id, name: name || id, players: new Map(), game: null };
    this.rooms.set(id, room);
    console.log(`🏠 Raum erstellt: ${id} (${room.name})`);
    return room;
  },

  getRoomByNameOrId(nameOrId) {
    if (!nameOrId) return null;
    // direct id
    if (this.rooms.has(nameOrId)) return this.rooms.get(nameOrId);
    // search by name
    for (const r of this.rooms.values()) {
      if (r.name === nameOrId) return r;
    }
    return null;
  },

  joinRoom(ws, roomName) {
    // find or create
    let room = this.getRoomByNameOrId(roomName);
    if (!room) {
      room = this.createRoom(roomName);
    }
    // store player meta on ws for convenience
    const meta = { id: ws.userId || null, username: ws.username || "Gast" };
    room.players.set(ws, meta);

    // attach reverse pointer for quick removal
    ws._roomId = room.id;

    // notify joining client
    const playersList = Array.from(room.players.values()).map(p => p.username);
    sendToWs(ws, {
      type: "room_joined",
      room: room.id,
      roomName: room.name,
      players: playersList,
      message: `Du bist dem Raum "${room.name}" beigetreten.`,
    });

    // notify others in room
    this.broadcastToRoom(room.id, {
      type: "room_update",
      room: room.id,
      roomName: room.name,
      players: playersList,
      message: `${meta.username} ist dem Raum beigetreten.`,
    }, ws);

    console.log(`👥 ${meta.username} ist Raum ${room.id} beigetreten.`);
  },

  leaveRoom(ws, roomName) {
    const roomId = ws._roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    const meta = room.players.get(ws);
    room.players.delete(ws);
    delete ws._roomId;

    const playersList = Array.from(room.players.values()).map(p => p.username);
    this.broadcastToRoom(room.id, {
      type: "room_update",
      room: room.id,
      roomName: room.name,
      players: playersList,
      message: `${meta ? meta.username : "Ein Spieler"} hat den Raum verlassen.`,
    });

    // if no players left -> cleanup
    if (room.players.size === 0) {
      if (room.game && typeof room.game.destroy === "function") {
        room.game.destroy();
      }
      this.rooms.delete(room.id);
      console.log(`🧹 Raum ${room.id} gelöscht (leer).`);
    }
  },

  startGame(ws, roomIdOrName, settings = {}) {
    const room = this.getRoomByNameOrId(roomIdOrName || ws._roomId);
    if (!room) {
      sendToWs(ws, { type: "error", message: "Raum nicht gefunden." });
      return;
    }

    // cannot start if less than 1 player
    if (room.players.size < 1) {
      sendToWs(ws, { type: "error", message: "Nicht genug Spieler zum Starten." });
      return;
    }

    // create game instance if none
    if (!room.game) {
      const players = Array.from(room.players.values()).map((p, idx) => ({
        id: p.id || idx + 1,
        username: p.username || `Spieler${idx + 1}`,
      }));
      const game = createGameInstance(players, settings);
      room.game = game;

      // hook game events to broadcast to room
      game.onUpdate = (payload) => {
        this.broadcastToRoom(room.id, { type: "game_update", ...payload });
      };
      game.onEnd = (payload) => {
        this.broadcastToRoom(room.id, { type: "game_end", ...payload });
        room.game = null;
      };
    }

    // start the game
    room.game.start();
    this.broadcastToRoom(room.id, {
      type: "start_game",
      room: room.id,
      players: Array.from(room.players.values()).map(p => p.username),
      message: `Spiel startet im Raum ${room.name}`,
    });
    console.log(`▶ Spiel gestartet in Raum ${room.id}`);
  },

  playerThrow(ws, data) {
    const roomId = ws._roomId;
    if (!roomId) {
      sendToWs(ws, { type: "error", message: "Du bist in keinem Raum." });
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room || !room.game) {
      sendToWs(ws, { type: "error", message: "Kein Spiel aktiv." });
      return;
    }
    // expect data.payload: { segment: 20, multiplier: 3 } or data.value
    room.game.playerThrow(ws.userId || ws.username, data);
  },

  playerScore(ws, data) {
    // generic passthrough to game
    const roomId = ws._roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || !room.game) return;
    room.game.playerScore(ws.userId || ws.username, data);
  },

  broadcastToRoom(roomId, obj, excludeWs = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const payload = JSON.stringify(obj);
    for (const client of room.players.keys()) {
      if (client.readyState === 1 && client !== excludeWs) {
        client.send(payload);
      }
    }
  },

  // utility: get list of rooms (for UI if needed)
  listRooms() {
    return Array.from(this.rooms.values()).map(r => ({
      id: r.id,
      name: r.name,
      playerCount: r.players.size,
      gameActive: !!r.game,
    }));
  }
};

// helper: safe send
function sendToWs(ws, obj) {
  try {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch (e) {
    console.error("sendToWs Error:", e);
  }
}
