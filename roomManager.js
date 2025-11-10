// roomManager.js — DOCA WebDarts PRO
// Uses userManager functions to get names / send messages.

import {
  getUserName,
  broadcast,
  broadcastToPlayers,
  getClientId
} from "./userManager.js";

const rooms = new Map();      // roomId -> room
const userRooms = new Map();  // clientId -> roomId
const cleanupTimers = new Map();

const GRACE_MS = 30 * 1000; // 30s grace before deleting empty room

function makeRoomState(room) {
  return {
    type: "game_state",
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    players: room.players.slice(),
    playerNames: room.players.map((p) => getUserName(p) || "Gast"),
    options: room.options || {},
    isStarted: !!room.game?.isStarted,
    winner: room.game?.winner || null,
    scores: room.game?.scores || {},
    currentPlayerId: room.game?.currentPlayerId || null,
  };
}

export function createRoom(clientIdOrWs, name = "Neuer Raum", options = {}) {
  const clientId = typeof clientIdOrWs === "string" ? clientIdOrWs : getClientId(clientIdOrWs);
  if (!clientId) return null;

  // if already in a room, return existing
  if (userRooms.has(clientId)) {
    return userRooms.get(clientId);
  }

  const id = Math.random().toString(36).slice(2, 9);
  const room = {
    id,
    name,
    ownerId: clientId,
    players: [clientId],
    options,
    maxPlayers: 2,
    game: null,
    createdAt: Date.now()
  };
  rooms.set(id, room);
  userRooms.set(clientId, id);

  // cancel cleanup if any
  if (cleanupTimers.has(id)) {
    clearTimeout(cleanupTimers.get(id));
    cleanupTimers.delete(id);
  }

  updateRoomList();
  return id;
}

export function joinRoom(clientIdOrWs, roomId) {
  const clientId = typeof clientIdOrWs === "string" ? clientIdOrWs : getClientId(clientIdOrWs);
  if (!clientId) return false;
  const room = rooms.get(roomId);
  if (!room) return false;

  // already in that room
  if (room.players.includes(clientId)) {
    // cancel cleanup if scheduled
    if (cleanupTimers.has(roomId)) {
      clearTimeout(cleanupTimers.get(roomId));
      cleanupTimers.delete(roomId);
    }
    // send current state to players
    broadcastToPlayers(room.players, makeRoomState(room));
    updateRoomList();
    return true;
  }

  // if client in another room, remove
  const prev = userRooms.get(clientId);
  if (prev && prev !== roomId) {
    leaveRoom(clientId);
  }

  if (room.players.length >= room.maxPlayers) return false;
  room.players.push(clientId);
  userRooms.set(clientId, roomId);

  // cancel cleanup
  if (cleanupTimers.has(roomId)) {
    clearTimeout(cleanupTimers.get(roomId));
    cleanupTimers.delete(roomId);
  }

  // notify all in room
  broadcastToPlayers(room.players, makeRoomState(room));
  updateRoomList();
  return true;
}

export function leaveRoom(clientIdOrWs) {
  const clientId = typeof clientIdOrWs === "string" ? clientIdOrWs : getClientId(clientIdOrWs);
  if (!clientId) return false;
  const rid = userRooms.get(clientId);
  if (!rid) return false;
  const room = rooms.get(rid);
  if (!room) {
    userRooms.delete(clientId);
    return false;
  }

  room.players = room.players.filter((p) => p !== clientId);
  userRooms.delete(clientId);

  if (room.ownerId === clientId) {
    room.ownerId = room.players[0] || null;
  }

  if (room.players.length === 0) {
    // schedule deletion
    if (cleanupTimers.has(rid)) clearTimeout(cleanupTimers.get(rid));
    const t = setTimeout(() => {
      const r = rooms.get(rid);
      if (r && r.players.length === 0) {
        rooms.delete(rid);
      }
      if (cleanupTimers.has(rid)) {
        clearTimeout(cleanupTimers.get(rid));
        cleanupTimers.delete(rid);
      }
      updateRoomList();
    }, GRACE_MS);
    cleanupTimers.set(rid, t);
  } else {
    // notify remaining
    broadcastToPlayers(room.players, makeRoomState(room));
  }

  updateRoomList();
  return true;
}

export function getRoomByClientId(clientIdOrWs) {
  const clientId = typeof clientIdOrWs === "string" ? clientIdOrWs : getClientId(clientIdOrWs);
  if (!clientId) return null;
  const rid = userRooms.get(clientId);
  return rid ? rooms.get(rid) : null;
}

export function getRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return makeRoomState(room);
}

export function updateRoomList() {
  const list = Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    owner: getUserName(r.ownerId) || "Gast",
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    options: r.options || {}
  }));
  broadcast({ type: "room_update", rooms: list });
}

/* Debug / export */
export function listRooms() {
  return Array.from(rooms.values()).map(r => ({
    id: r.id, players: r.players.slice()
  }));
}
