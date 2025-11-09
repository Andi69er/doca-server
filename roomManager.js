// roomManager.js — DOCA WebDarts PRO
import { broadcast, sendToClient, getUserName } from "./userManager.js";

globalThis.rooms = {};

function createRoom(clientId, name = "Neuer Raum", options = {}) {
  const id = Math.random().toString(36).substring(2, 8);
  const room = {
    id,
    name,
    ownerId: clientId,
    players: [], // Start with empty players, owner joins right after
    maxPlayers: 2,
    options, // The whole options object is stored
    game: null,
    createdAt: Date.now(),
  };
  globalThis.rooms[id] = room;
  console.log(`🎯 Raum erstellt: ${name} (${id})`);
  
  // Let the creator join the room immediately
  joinRoom(clientId, id);
}

function joinRoom(clientId, roomId) {
  const room = globalThis.rooms[roomId];
  if (!room) {
    console.error(`Raum ${roomId} nicht gefunden für Beitritt von ${clientId}`);
    return;
  }
  
  // Remove from old room if exists
  leaveRoom(clientId, false); 

  if (room.players.length < room.maxPlayers && !room.players.includes(clientId)) {
    room.players.push(clientId);
    globalThis.userRooms[clientId] = roomId;
    sendToClient(clientId, { type: "joined_room", roomId: roomId });
  } else {
    // Optionally send an error if room is full or user is already in
    console.warn(`Benutzer ${clientId} konnte Raum ${roomId} nicht beitreten.`);
  }
  updateRoomList();
}

function leaveRoom(clientId, doUpdate = true) {
  const rid = globalThis.userRooms[clientId];
  if (!rid) return;

  const room = globalThis.rooms[rid];
  if (!room) return;

  room.players = room.players.filter((p) => p !== clientId);
  delete globalThis.userRooms[clientId];

  if (room.players.length === 0) {
    console.log(`Raum ${room.name} (${rid}) ist leer und wird entfernt.`);
    delete globalThis.rooms[rid];
  } else {
    // If the owner leaves, assign a new owner
    if (room.ownerId === clientId && room.players.length > 0) {
      room.ownerId = room.players[0];
      console.log(`Neuer Besitzer für Raum ${room.name}: ${getUserName(room.ownerId)}`);
    }
  }
  
  if (doUpdate) {
    updateRoomList();
  }
}

function removeEmptyRooms() {
  for (const [id, r] of Object.entries(globalThis.rooms)) {
    if (r.players.length === 0) {
      delete globalThis.rooms[id];
    }
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
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    // FIX: Spread the stored options into the object sent to clients
    ...(r.options || {}),
  }));
  broadcast({ type: "room_update", rooms: list });
  // Also compatible with the other client expecting a direct list
  broadcast({ type: "rooms_list", rooms: list }); 
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