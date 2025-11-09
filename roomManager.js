// roomManager.js — DOCA WebDarts PRO
import { broadcast, sendToClient, getUserName } from "./userManager.js";

globalThis.rooms = {};

function createRoom(clientId, name = "Neuer Raum", options = {}) {
  const id = Math.random().toString(36).substring(2, 8);
  const room = {
    id,
    name,
    ownerId: clientId,
    players: [clientId],
    maxPlayers: 2,
    options,
    game: null,
    createdAt: Date.now(),
  };
  globalThis.rooms[id] = room;
  console.log(`🎯 Raum erstellt: ${name} (${id})`);
  updateRoomList();
}

function joinRoom(clientId, roomId) {
  const room = globalThis.rooms[roomId];
  if (!room) return;
  if (!room.players.includes(clientId)) room.players.push(clientId);
  globalThis.userRooms[clientId] = roomId;
  updateRoomList();
}

function leaveRoom(clientId) {
  const rid = globalThis.userRooms[clientId];
  if (!rid) return;
  const room = globalThis.rooms[rid];
  if (!room) return;
  room.players = room.players.filter((p) => p !== clientId);
  if (room.players.length === 0) delete globalThis.rooms[rid];
  globalThis.userRooms[clientId] = null;
  updateRoomList();
}

function removeEmptyRooms() {
  for (const [id, r] of Object.entries(globalThis.rooms)) {
    if (r.players.length === 0) delete globalThis.rooms[id];
  }
}

function getRoomById(id) {
  return globalThis.rooms[id];
}

function getRoomByClientId(cid) {
  const rid = globalThis.userRooms[cid];
  return rid ? globalThis.rooms[rid] : null;
}

function updateRoomList() {
  const list = Object.values(globalThis.rooms).map((r) => ({
    id: r.id,
    name: r.name,
    owner: getUserName(r.ownerId),
    players: r.players.map((p) => getUserName(p)),
    maxPlayers: r.maxPlayers,
  }));
  broadcast({ type: "room_update", rooms: list });
}

function getRooms() {
  return Object.values(globalThis.rooms);
}

export {
  createRoom,
  joinRoom,
  leaveRoom,
  getRooms,
  removeEmptyRooms,
  getRoomById,
  getRoomByClientId,
  updateRoomList,
};
