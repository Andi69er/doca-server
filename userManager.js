// userManager.js — DOCA WebDarts PRO
import { broadcast, sendToClient } from "./userManager.js";

globalThis.clients = {};
globalThis.userNames = {};
globalThis.userRooms = {};

function registerClient(ws) {
  const id = Math.random().toString(36).substring(2, 8);
  globalThis.clients[id] = ws;
  // User starts as a guest, will be updated upon authentication
  globalThis.userNames[id] = "Gast-" + id;
  globalThis.userRooms[id] = null;
  return id;
}

// --- NEUE FUNKTION HINZUGEFÜGT ---
function setUserName(clientId, name) {
  if (globalThis.userNames[clientId]) {
    globalThis.userNames[clientId] = name || `Gast-${clientId.slice(0,4)}`;
    console.log(`✅ Benutzer ${clientId} authentifiziert als: ${name}`);
    // Broadcast the updated online list to everyone
    broadcastOnlineList();
  }
}

function removeClient(clientId) {
  delete globalThis.clients[clientId];
  delete globalThis.userNames[clientId];
  // No need to delete from userRooms here, leaveRoom handles it
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

// Exporte anpassen
export {
  registerClient,
  removeClient,
  getUserName,
  getOnlineUserNames,
  broadcast,
  sendToClient,
  handleClientMessage,
  setUserName // Wichtig: die neue Funktion exportieren
};