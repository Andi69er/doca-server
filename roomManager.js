// roomManager.js — DOCA WebDarts PRO
import { broadcast, sendToClient, getUserName, broadcastToPlayers } from "./userManager.js";

globalThis.rooms = {};

// Interne Funktion, um alle Spieler im Raum über den aktuellen Stand zu informieren
function broadcastRoomState(roomId) {
    const room = globalThis.rooms[roomId];
    if (!room) return;

    const playerNames = room.players.map(pid => getUserName(pid));
    const roomState = {
        type: "room_player_update",
        roomId: room.id,
        players: room.players,
        playerNames: playerNames,
        isFull: room.players.length === room.maxPlayers,
        ownerId: room.ownerId
    };
    if (room.players.length > 0) {
        broadcastToPlayers(room.players, roomState);
    }
}

function createRoom(clientId, name = "Neuer Raum", options = {}) {
  const id = Math.random().toString(36).substring(2, 8);
  const room = { id, name, ownerId: clientId, players: [], maxPlayers: 2, options, game: null, createdAt: Date.now() };
  globalThis.rooms[id] = room;
  console.log(`🎯 Raum erstellt: ${name} (${id})`);
  joinRoom(clientId, id);
}

function joinRoom(clientId, roomId) {
  const room = globalThis.rooms[roomId];
  if (!room) {
    console.error(`Fehler: Raum ${roomId} nicht gefunden.`);
    return;
  }
  
  // Verlasse den alten Raum, falls vorhanden
  leaveRoom(clientId, false); 
  
  if (room.players.length < room.maxPlayers && !room.players.includes(clientId)) {
    room.players.push(clientId);
    globalThis.userRooms[clientId] = roomId;
    sendToClient(clientId, { type: "joined_room", roomId: roomId });
  }
  
  updateRoomList(); // Lobby aktualisieren
  broadcastRoomState(roomId); // Spiel-Seite aktualisieren
}

function leaveRoom(clientId, doUpdate = true) {
  const rid = globalThis.userRooms[clientId];
  if (!rid || !globalThis.rooms[rid]) return; // Wichtig: Bricht ab, wenn der User in keinem Raum ist
  
  const room = globalThis.rooms[rid];
  room.players = room.players.filter((p) => p !== clientId);
  delete globalThis.userRooms[clientId];

  if (room.players.length === 0) {
    console.log(`Raum ${rid} ist leer und wird gelöscht.`);
    delete globalThis.rooms[rid];
  } else {
    if (room.ownerId === clientId) { room.ownerId = room.players[0]; }
    broadcastRoomState(rid); // Verbleibende Spieler informieren
  }
  
  if (doUpdate) {
    updateRoomList();
  }
}

function getRoomByClientId(cid) {
  const rid = globalThis.userRooms[cid];
  return rid ? globalThis.rooms[rid] : null;
}

function updateRoomList() {
  const list = Object.values(globalThis.rooms).map((r) => ({
    id: r.id, name: r.name, owner: getUserName(r.ownerId),
    players: r.players.map((p) => getUserName(p)),
    playerCount: r.players.length, maxPlayers: r.maxPlayers,
    ...(r.options || {}),
  }));
  broadcast({ type: "room_update", rooms: list });
}

export { createRoom, joinRoom, leaveRoom, getRoomByClientId, updateRoomList };```

---

### 2. `server.js` (korrigiert)

Diese Datei lernt, Spiel-Nachrichten zu verarbeiten und den Spielzustand mit den Namen der Spieler anzureichern.

```javascript
// server.js — DOCA WebDarts PRO Server
import { WebSocketServer } from "ws";
import { registerClient, removeClient, getUserName, getOnlineUserNames, setUserName, broadcast, sendToClient, broadcastToPlayers } from "./userManager.js";
import { createRoom, joinRoom, leaveRoom, getRoomByClientId, updateRoomList } from "./roomManager.js";
import { Game } from "./gameLogic.js";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

// Helfer, um den Spielzustand mit Namen anzureichern
function getEnrichedGameState(game) {
    const state = game.getState();
    state.playerNames = state.players.map(pid => getUserName(pid));
    return state;
}

wss.on("connection", (ws) => {
  const clientId = registerClient(ws);
  console.log(`✅ Benutzer verbunden: ${clientId}`);
  ws.send(JSON.stringify({ type: "connected", clientId, name: getUserName(clientId) }));
  broadcast({ type: "online_list", users: getOnlineUserNames() });
  updateRoomList();
  ws.on("message", (msg) => {
    try { const data = JSON.parse(msg); handleMessage(ws, clientId, data); } 
    catch (e) { console.error("❌ Ungültige Nachricht:", e); }
  });
  ws.on("close", () => {
    console.log(`❌ Benutzer getrennt: ${clientId}`);
    leaveRoom(clientId);
    removeClient(clientId);
    broadcast({ type: "online_list", users: getOnlineUserNames() });
  });
});

function handleMessage(ws, clientId, data) {
  const room = getRoomByClientId(clientId);
  switch (data.type) {
    case "auth": setUserName(clientId, data.user); break;
    case "chat_global": broadcast({ type: "chat_global", user: getUserName(clientId), message: data.message }); break;
    case "create_room": createRoom(clientId, data.name, data); break;
    case "join_room": joinRoom(clientId, data.roomId); break;
    case "leave_room": leaveRoom(clientId); break;
    case "list_rooms": updateRoomList(); break;
    case "list_online": sendToClient(clientId, { type: "online_list", users: getOnlineUserNames() }); break;
    
    // Spiel-Nachrichten
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
    default: 
      console.warn(`⚠️ Unbekannter Nachrichtentyp: ${data.type}`);
  }
}