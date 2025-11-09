// server.js — DOCA WebDarts PRO Server (vollständige Datei)
// Copy & Paste

import { WebSocketServer } from "ws";
import {
  registerClient,
  removeClient,
  getUserName,
  getOnlineUserNames,
  setUserName,
  broadcast,
  sendToClient,
  broadcastToPlayers,
  findClientIdByName
} from "./userManager.js";
import { createRoom, joinRoom, leaveRoom, getRoomByClientId, updateRoomList, getRoomState } from "./roomManager.js";
import { Game } from "./gameLogic.js";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

wss.on("connection", (ws) => {
  const clientId = registerClient(ws);
  console.log(`+ client connected: ${clientId}`);

  ws.on("message", (msg) => {
    let data = null;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("❌ Ungültige JSON-Nachricht:", e);
      return;
    }
    try {
      handleMessage(ws, clientId, data);
    } catch (e) {
      console.error("handleMessage error:", e);
    }
  });

  ws.on("close", () => {
    console.log(`- client disconnected: ${clientId}`);
    // schedule a short cleanup: allows quick reconnects to re-use username if necessary
    if (globalThis.cleanupTimers[clientId]) clearTimeout(globalThis.cleanupTimers[clientId]);
    globalThis.cleanupTimers[clientId] = setTimeout(() => {
      try {
        const username = getUserName(clientId);
        // ensure client removed from rooms
        leaveRoom(clientId);
        removeClient(clientId);
        // inform lobby
        broadcast({ type: "online_list", users: getOnlineUserNames() });
        updateRoomList();
        console.log(`cleanup completed for ${clientId} (${username})`);
      } catch (e) {
        console.error("cleanup error:", e);
      } finally {
        if (globalThis.cleanupTimers[clientId]) {
          clearTimeout(globalThis.cleanupTimers[clientId]);
          delete globalThis.cleanupTimers[clientId];
        }
      }
    }, 3000); // 3s grace window
  });

  // optional: ping/pong handling omitted for brevity
});

/**
 * Helper: enrich Game state with player names for frontend convenience
 */
function getEnrichedGameState(game) {
  const raw = game.getState();
  raw.playerNames = raw.players.map(pid => getUserName(pid));
  return raw;
}

function handleMessage(ws, clientId, data) {
  if (!data || !data.type) return;
  const type = (data.type || "").toString();

  // Authentication / identification
  if (type === "auth") {
    const username = (data.user || `Gast-${clientId}`).toString();
    // cancel any pending cleanup for this clientId
    if (globalThis.cleanupTimers[clientId]) {
      clearTimeout(globalThis.cleanupTimers[clientId]);
      delete globalThis.cleanupTimers[clientId];
    }
    setUserName(clientId, username);
    // send back connected ack
    sendToClient(clientId, { type: "connected", clientId, name: username });
    // broadcast online list & rooms
    broadcast({ type: "online_list", users: getOnlineUserNames() });
    updateRoomList();
    return;
  }

  // Resolve room for client, many actions require room context
  const room = getRoomByClientId(clientId);

  switch (type) {
    case "create_room": {
      const name = data.name || `Raum-${Math.random().toString(36).slice(2,6)}`;
      const options = Object.assign({}, data);
      createRoom(clientId, name, options);
      // updateRoomList() gets called by createRoom
      break;
    }

    case "join_room": {
      const roomId = data.roomId;
      if (!roomId) break;
      joinRoom(clientId, roomId);
      // After joining, send full room/game_state to players in that room
      const joinedRoom = getRoomByClientId(clientId);
      if (joinedRoom) {
        const state = getRoomState(joinedRoom.id);
        broadcastToPlayers(joinedRoom.players, state);
      }
      break;
    }

    case "leave_room": {
      leaveRoom(clientId);
      break;
    }

    case "list_rooms": {
      updateRoomList();
      break;
    }

    case "start_game": {
      if (!room) break;
      // only owner can start and require 2 players
      if (room.ownerId === clientId && (room.players.length >= 1)) {
        room.options = Object.assign({}, room.options, data.options || {});
        room.game = new Game(room.players.slice(), room.options);
        room.game.start();
        // send initial game state to players
        broadcastToPlayers(room.players, getEnrichedGameState(room.game));
      }
      break;
    }

    case "player_throw": {
      if (!room || !room.game) break;
      // value & mult expected
      room.game.playerThrow(clientId, Number(data.value || 0), Number(data.mult || 1));
      broadcastToPlayers(room.players, getEnrichedGameState(room.game));
      break;
    }

    case "undo_throw": {
      if (!room || !room.game) break;
      room.game.undoLastThrow(clientId);
      broadcastToPlayers(room.players, getEnrichedGameState(room.game));
      break;
    }

    case "request_room_members": {
      const rid = data.roomId || (room && room.id);
      if (rid && globalThis.rooms[rid]) {
        const r = globalThis.rooms[rid];
        sendToClient(clientId, { type: "room_members", roomId: rid, members: r.players.map(pid => ({ id: pid, name: getUserName(pid) })) });
      }
      break;
    }

    case "chat":
    case "chat_global": {
      // broadcast chat to lobby (or room if room-specific - simple global)
      const payload = { type: "chat_global", user: getUserName(clientId) || `Gast-${clientId}`, message: data.message || "" };
      broadcast(payload);
      break;
    }

    default: {
      console.warn("⚠️ Unbekannter Nachrichtentyp:", type);
    }
  }
}
