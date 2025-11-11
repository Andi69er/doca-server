// ======================================================
// Raumverwaltung (DOCA WebDarts PRO)
// ======================================================

import { getUserName, broadcast, broadcastToPlayers, getClientId } from "./userManager.js";

const rooms = new Map();
const userRooms = new Map();
const cleanupTimers = new Map();
const GRACE_MS = 30 * 1000;

function makeRoomState(room) {
  return {
    type: "room_state",
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    players: room.players.slice(),
    playerNames: room.players.map((p) => getUserName(p) || "Gast"),
    options: room.options || {},
    maxPlayers: room.maxPlayers,
    createdAt: room.createdAt,
  };
}

export function createRoom(clientId, name = "Neuer Raum", options = {}) {
  if (!clientId) return null;
  if (userRooms.has(clientId)) return userRooms.get(clientId);

  const id = Math.random().toString(36).slice(2, 9);
  const room = {
    id,
    name,
    ownerId: clientId,
    players: [clientId],
    options,
    maxPlayers: 2,
    createdAt: Date.now(),
  };

  rooms.set(id, room);
  userRooms.set(clientId, id);

  if (cleanupTimers.has(id)) {
    clearTimeout(cleanupTimers.get(id));
    cleanupTimers.delete(id);
  }

  broadcastToPlayers([clientId], makeRoomState(room));
  updateRoomList();
  return id;
}

export function joinRoom(clientId, roomId) {
  if (!clientId) return false;
  const room = rooms.get(roomId);
  if (!room) return false;

  if (room.players.includes(clientId)) return true;
  if (room.players.length >= room.maxPlayers) return false;

  const prev = userRooms.get(clientId);
  if (prev && prev !== roomId) leaveRoom(clientId);

  room.players.push(clientId);
  userRooms.set(clientId, roomId);

  const updated = makeRoomState(room);
  broadcastToPlayers(room.players, updated);
  updateRoomList();
  return true;
}

export function leaveRoom(clientId) {
  const rid = userRooms.get(clientId);
  if (!rid) return;
  const room = rooms.get(rid);
  if (!room) return;

  room.players = room.players.filter((p) => p !== clientId);
  userRooms.delete(clientId);

  if (room.players.length === 0) {
    const t = setTimeout(() => {
      if (room.players.length === 0) rooms.delete(rid);
      updateRoomList();
    }, GRACE_MS);
    cleanupTimers.set(rid, t);
  } else {
    broadcastToPlayers(room.players, makeRoomState(room));
  }

  updateRoomList();
}

export function getRoomByClientId(clientId) {
  const rid = userRooms.get(clientId);
  return rid ? rooms.get(rid) : null;
}

export function updateRoomList() {
  const list = Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    owner: getUserName(r.ownerId) || "Gast",
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    options: r.options || {},
  }));
  broadcast({ type: "room_update", rooms: list });
}
