// server.js — DOCA WebDarts PRO Server
import { WebSocketServer } from "ws";
import { registerClient, removeClient, getUserName, getOnlineUserNames, setUserName, broadcast, sendToClient, broadcastToPlayers, findClientIdByName } from "./userManager.js";
// KORREKTUR: Der fehlerhafte Import von 'getRoomState' wurde entfernt.
import { createRoom, joinRoom, leaveRoom, getRoomByClientId, updateRoomList } from "./roomManager.js";
import { Game } from "./gameLogic.js";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

globalThis.cleanupTimers = {};

function getEnrichedGameState(game) {
    const state = game.getState();
    state.playerNames = state.players.map(pid => getUserName(pid));
    return state;
}

function cleanupUser(username) {
    const clientId = findClientIdByName(username);
    if (clientId) {
        leaveRoom(clientId); removeClient(clientId);
        broadcast({ type: "online_list", users: getOnlineUserNames() });
    }
    delete globalThis.cleanupTimers[username];
}

wss.on("connection", (ws) => {
  const clientId = registerClient(ws);
  ws.on("message", (msg) => {
    try { const data = JSON.parse(msg); handleMessage(ws, clientId, data); } 
    catch (e) { console.error("❌ Ungültige Nachricht:", e); }
  });
  ws.on("close", () => {
    const username = getUserName(clientId);
    if (username && !username.startsWith("Gast-")) {
        if (globalThis.cleanupTimers[username]) clearTimeout(globalThis.cleanupTimers[username]);
        globalThis.cleanupTimers[username] = setTimeout(() => cleanupUser(username), 5000);
    } else { removeClient(clientId); }
  });
});

function handleMessage(ws, clientId, data) {
  if (data.type === 'auth') {
    const username = data.user;
    if (globalThis.cleanupTimers[username]) {
        clearTimeout(globalThis.cleanupTimers[username]);
        delete globalThis.cleanupTimers[username];
    }
    setUserName(clientId, data.user);
    ws.send(JSON.stringify({ type: "connected", clientId, name: data.user }));
    broadcast({ type: "online_list", users: getOnlineUserNames() });
    updateRoomList();
    return;
  }

  const room = getRoomByClientId(clientId);

  switch (data.type) {
    case "create_room": createRoom(clientId, data.name, data); break;
    case "join_room": joinRoom(clientId, data.roomId); break;
    case "leave_room": leaveRoom(clientId); break;
    case "list_rooms": updateRoomList(); break;
    
    case "start_game":
        if (room && room.ownerId === clientId && room.players.length === 2) {
            room.game = new Game(room.players, room.options);
            room.game.start();
            broadcastToPlayers(room.players, getEnrichedGameState(room.game));
        }
        break;
    case "player_throw":
        if (room && room.game) {
            room.game.playerThrow(clientId, data.value, data.mult);
            broadcastToPlayers(room.players, getEnrichedGameState(room.game));
        }
        break;
    case "undo_throw":
        if (room && room.game) {
            room.game.undoLastThrow(clientId);
            broadcastToPlayers(room.players, getEnrichedGameState(room.game));
        }
        break;
        
    default: console.warn("⚠️ Unbekannter Nachrichtentyp:", data.type);
  }
}