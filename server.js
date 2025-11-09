// server.js — DOCA WebDarts PRO Server
import { WebSocketServer } from "ws";
import {
  registerClient, removeClient, getUserName, getOnlineUserNames,
  setUserName, broadcast, sendToClient, broadcastToPlayers
} from "./userManager.js";
import {
  createRoom, joinRoom, leaveRoom, getRoomByClientId, updateRoomList
} from "./roomManager.js";
import { Game } from "./gameLogic.js"; // Die neue Spiellogik importieren

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

wss.on("connection", (ws) => {
  const clientId = registerClient(ws);
  // ... (connection, message, close events bleiben gleich)
});

function handleMessage(ws, clientId, data) {
    const room = getRoomByClientId(clientId);

    switch (data.type) {
        // --- Lobby & Chat-Nachrichten ---
        case "auth": setUserName(clientId, data.user); break;
        case "chat_global": broadcast({ type: "chat_global", user: getUserName(clientId), message: data.message }); break;
        case "create_room": createRoom(clientId, data.name, data); break;
        case "join_room": joinRoom(clientId, data.roomId); break;
        case "leave_room": leaveRoom(clientId); break;
        case "list_rooms": updateRoomList(); break;
        case "list_online": sendToClient(clientId, { type: "online_list", users: getOnlineUserNames() }); break;

        // --- Spiel-Nachrichten ---
        case "start_game":
            if (room && room.ownerId === clientId && room.players.length === 2) {
                room.game = new Game(room.players, room.options);
                const gameState = room.game.start();
                broadcastToPlayers(room.players, gameState);
            }
            break;

        case "player_throw":
            if (room && room.game) {
                const gameState = room.game.playerThrow(clientId, data.value, data.mult);
                broadcastToPlayers(room.players, gameState);
            }
            break;

        case "undo_throw":
            if (room && room.game) {
                const gameState = room.game.undoLastThrow(clientId);
                broadcastToPlayers(room.players, gameState);
            }
            break;

        default:
            console.warn("⚠️ Unbekannter Nachrichtentyp:", data.type);
    }
}

// Der Rest der server.js (wss.on(...) etc.) muss natürlich vorhanden sein
wss.on("connection", (ws) => {
  const clientId = registerClient(ws);
  console.log(`✅ Benutzer verbunden: ${clientId}`);

  ws.send(JSON.stringify({ type: "connected", clientId, name: getUserName(clientId) }));
  broadcast({ type: "online_list", users: getOnlineUserNames() });
  updateRoomList();

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      handleMessage(ws, clientId, data);
    } catch (e) {
      console.error("❌ Ungültige Nachricht:", e);
    }
  });

  ws.on("close", () => {
    console.log(`❌ Benutzer getrennt: ${clientId}`);
    leaveRoom(clientId);
    removeClient(clientId);
    broadcast({ type: "online_list", users: getOnlineUserNames() });
  });
});