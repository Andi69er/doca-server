// userManager.js — DOCA WebDarts PRO
import { getRoomByClientId, updateRoomList } from "./roomManager.js";
import { Game } from "./gameLogic.js";

globalThis.clients = {};
globalThis.userNames = {};
globalThis.userRooms = {};

function registerClient(ws) {
  const id = Math.random().toString(36).substring(2, 8);
  globalThis.clients[id] = ws;
  globalThis.userNames[id] = "Gast-" + id;
  globalThis.userRooms[id] = null;
  return id;
}

// NEUE FUNKTION, um den Namen nach der Authentifizierung zu setzen
function setUserName(clientId, name) {
  if (globalThis.userNames[clientId]) {
    globalThis.userNames[clientId] = name || `Gast-${clientId.slice(0,4)}`;
    console.log(`✅ Benutzer ${clientId} authentifiziert als: ${name}`);
    // Sende die aktualisierte Online-Liste an alle
    broadcastOnlineList();
  }
}

function removeClient(clientId) {
  delete globalThis.clients[clientId];
  delete globalThis.userNames[clientId];
  // userRooms wird durch leaveRoom bereinigt
}

function getUserName(clientId) {
  return globalThis.userNames[clientId] || "Unbekannt";
}

function getOnlineUserNames() {
  return Object.values(globalThis.userNames || {});
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of Object.values(globalThis.clients)) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

// Kleine Helferfunktion, um die Online-Liste zu senden
function broadcastOnlineList() {
    broadcast({ type: "online_list", users: getOnlineUserNames() });
}

function sendToClient(clientId, obj) {
  const ws = globalThis.clients[clientId];
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function handleClientMessage(clientId, data) {
  const room = getRoomByClientId(clientId);
  if (!room) return;
  if (!room.game) room.game = new Game(room.id, room.players, room.options);

  const game = room.game;

  switch (data.type) {
    case "start_game":
      game.start();
      broadcast(game.getState());
      break;
    case "throw_dart":
      broadcast(game.playerThrow(clientId, data.value, data.mult).state);
      break;
    case "bull_shot":
      broadcast(game.handleBullShot(clientId, data.mult).state);
      break;
    case "undo_throw":
      broadcast(game.undoLastThrow(clientId).state);
      break;
    default:
      console.warn("⚠️ Unbekannter Game-Befehl:", data.type);
  }
}

export {
  registerClient,
  removeClient,
  getUserName,
  getOnlineUserNames, // Hinzugefügt für den Server
  broadcast,
  sendToClient,
  handleClientMessage,
  setUserName, // Die neue Funktion exportieren
};