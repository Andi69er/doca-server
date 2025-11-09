// server.js — DOCA WebDarts PRO Server (mit list_online Support)
// Vollständige Datei — Copy & Paste

import { WebSocketServer } from "ws";
import {
  registerClient,
  removeClient,
  getUserName,
  getOnlineUserNames,
  setUserName,
  broadcast,
  sendToClient,
  broadcastToPlayers
} from "./userManager.js";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomByClientId,
  updateRoomList,
  getRoomState
} from "./roomManager.js";
import { Game } from "./gameLogic.js";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

globalThis.cleanupTimers = {};

wss.on("connection", (ws) => {
  const clientId = registerClient(ws);
  console.log(`+ Client verbunden: ${clientId}`);

  ws.on("message", (msg) => {
    let data = null;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("❌ Ungültige JSON-Nachricht:", e);
      return;
    }
    handleMessage(ws, clientId, data);
  });

  ws.on("close", () => {
    console.log(`- Verbindung geschlossen: ${clientId}`);
    if (globalThis.cleanupTimers[clientId])
      clearTimeout(globalThis.cleanupTimers[clientId]);
    globalThis.cleanupTimers[clientId] = setTimeout(() => {
      try {
        leaveRoom(clientId);
        removeClient(clientId);
        broadcast({ type: "online_list", users: getOnlineUserNames() });
        updateRoomList();
      } catch (e) {
        console.error("Cleanup Error:", e);
      } finally {
        if (globalThis.cleanupTimers[clientId]) {
          clearTimeout(globalThis.cleanupTimers[clientId]);
          delete globalThis.cleanupTimers[clientId];
        }
      }
    }, 3000);
  });
});

function getEnrichedGameState(game) {
  const state = game.getState();
  state.playerNames = state.players.map((pid) => getUserName(pid));
  return state;
}

function handleMessage(ws, clientId, data) {
  if (!data || !data.type) return;
  const type = data.type.toLowerCase();

  switch (type) {
    case "auth": {
      const username = data.user || `Gast-${clientId}`;
      if (globalThis.cleanupTimers[clientId]) {
        clearTimeout(globalThis.cleanupTimers[clientId]);
        delete globalThis.cleanupTimers[clientId];
      }
      setUserName(clientId, username);
      sendToClient(clientId, { type: "connected", clientId, name: username });
      broadcast({ type: "online_list", users: getOnlineUserNames() });
      updateRoomList();
      break;
    }

    case "list_online": {
      sendToClient(clientId, { type: "online_list", users: getOnlineUserNames() });
      break;
    }

    case "create_room": {
      createRoom(clientId, data.name, data);
      break;
    }

    case "join_room": {
      joinRoom(clientId, data.roomId);
      const joinedRoom = getRoomByClientId(clientId);
      if (joinedRoom) {
        broadcastToPlayers(joinedRoom.players, getRoomState(joinedRoom.id));
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
      const room = getRoomByClientId(clientId);
      if (room && room.ownerId === clientId && room.players.length >= 1) {
        room.game = new Game(room.players, room.options);
        room.game.start();
        broadcastToPlayers(room.players, getEnrichedGameState(room.game));
      }
      break;
    }

    case "player_throw": {
      const room = getRoomByClientId(clientId);
      if (room && room.game) {
        room.game.playerThrow(clientId, data.value, data.mult);
        broadcastToPlayers(room.players, getEnrichedGameState(room.game));
      }
      break;
    }

    case "undo_throw": {
      const room = getRoomByClientId(clientId);
      if (room && room.game) {
        room.game.undoLastThrow(clientId);
        broadcastToPlayers(room.players, getEnrichedGameState(room.game));
      }
      break;
    }

    case "chat_global": {
      const msg = {
        type: "chat_global",
        user: getUserName(clientId),
        message: data.message || "",
        time: Date.now(),
      };
      broadcast(msg);
      break;
    }

    default: {
      console.warn("⚠️ Unbekannter Nachrichtentyp:", data.type);
    }
  }
}
