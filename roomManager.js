// roomManager.js — DOCA WebDarts PRO (final, robust, copy & paste)

import { broadcast, broadcastToPlayers, getUserName } from "./userManager.js";

const rooms = new Map();         // roomId -> room
const userRooms = new Map();     // clientId -> roomId

/**
 * Sicheren Spielraumstatus zurückgeben.
 */
function getRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return {
    type: "game_state",
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    players: room.players.slice(),
    playerNames: room.players.map(p => getUserName(p)),
    options: room.options,
    isStarted: room.game?.isStarted || false,
    winner: room.game?.winner || null,
    scores: room.game?.scores || {},
    currentPlayerId: room.game?.currentPlayerId || null
  };
}

/**
 * Neuen Raum erstellen.
 */
export function createRoom(clientId, name = "Neuer Raum", options = {}) {
  const existing = userRooms.get(clientId);
  if (existing && rooms.has(existing)) return existing;

  const roomId = Math.random().toString(36).substring(2, 8);
  const room = {
    id: roomId,
    name,
    ownerId: clientId,
    players: [clientId],
    options,
    maxPlayers: 2,
    game: null
  };
  rooms.set(roomId, room);
  userRooms.set(clientId, roomId);
  updateRoomList();
  return roomId;
}

/**
 * Spieler Raum beitreten lassen.
 */
export function joinRoom(clientId, roomId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  if (!room.players.includes(clientId)) {
    if (room.players.length >= room.maxPlayers) return false;
    room.players.push(clientId);
    userRooms.set(clientId, roomId);
  }
  broadcastToPlayers(room.players, getRoomState(roomId));
  updateRoomList();
  return true;
}

/**
 * Spieler Raum verlassen lassen.
 */
export function leaveRoom(clientId) {
  const roomId = userRooms.get(clientId);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  room.players = room.players.filter(p => p !== clientId);
  userRooms.delete(clientId);

  if (room.ownerId === clientId && room.players.length > 0) {
    room.ownerId = room.players[0];
  }

  if (room.players.length === 0) {
    rooms.delete(roomId);
  } else {
    broadcastToPlayers(room.players, getRoomState(roomId));
  }

  updateRoomList();
}

/**
 * Raum anhand Client-ID finden.
 */
export function getRoomByClientId(clientId) {
  const roomId = userRooms.get(clientId);
  return roomId ? rooms.get(roomId) : null;
}

/**
 * Liste aller Räume an Lobby senden.
 */
export function updateRoomList() {
  const list = Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    owner: getUserName(r.ownerId),
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers
  }));
  broadcast({ type: "room_update", rooms: list });
}

/**
 * Alle Räume exportieren (Debug).
 */
export function listRooms() {
  return Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    players: r.players.map(p => getUserName(p))
  }));
}
