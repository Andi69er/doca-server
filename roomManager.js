// roomManager.js — DOCA WebDarts PRO
import { broadcast, sendToClient, getUserName } from "./userManager.js";

globalThis.rooms = {};

function createRoom(clientId, name = "Neuer Raum", options = {}) {
  const id = Math.random().toString(36).substring(2, 8);
  const room = { id, name, ownerId: clientId, players: [], maxPlayers: 2, options, game: null, createdAt: Date.now() };
  globalThis.rooms[id] = room;
  console.log(`🎯 Raum erstellt: ${name} (${id})`);
  joinRoom(clientId, id);
}

function joinRoom(clientId, roomId) {
  const room = globalThis.rooms[roomId];
  if (!room) return;
  leaveRoom(clientId, false); 
  if (room.players.length < room.maxPlayers && !room.players.includes(clientId)) {
    room.players.push(clientId);
    globalThis.userRooms[clientId] = roomId;
    sendToClient(clientId, { type: "joined_room", roomId: roomId });
  }
  updateRoomList();
}

function leaveRoom(clientId, doUpdate = true) {
  const rid = globalThis.userRooms[clientId];
  if (!rid || !globalThis.rooms[rid]) return;
  const room = globalThis.rooms[rid];
  room.players = room.players.filter((p) => p !== clientId);
  delete globalThis.userRooms[clientId];
  if (room.players.length === 0) { delete globalThis.rooms[rid]; } 
  else if (room.ownerId === clientId) { room.ownerId = room.players[0]; }
  if (doUpdate) { updateRoomList(); }
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

export { createRoom, joinRoom, leaveRoom, getRoomByClientId, updateRoomList };