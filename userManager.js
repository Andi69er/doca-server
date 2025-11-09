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

function removeClient(clientId) {
  delete globalThis.clients[clientId];
  delete globalThis.userNames[clientId];
  delete globalThis.userRooms[clientId];
  updateRoomList();
}

function getUserName(clientId) {
  return globalThis.userNames[clientId] || "Unbekannt";
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of Object.values(globalThis.clients)) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
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

export { registerClient, removeClient, getUserName, broadcast, sendToClient, handleClientMessage };
