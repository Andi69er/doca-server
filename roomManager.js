// roomManager.js — DOCA WebDarts PRO
// Finalversion: Spieler werden korrekt synchronisiert + Namen garantiert sichtbar

import {
  getUserName,
  setUserName,
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
    type: "room_state",
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    players: room.players.slice(),
    playerNames: room.players.map((p) => getUserName(p) || `Gast-${p}`),
    options: room.options || {},
    maxPlayers: room.maxPlayers,
    createdAt: room.createdAt
  };
}

export function createRoom(clientIdOrWs, name = "Neuer Raum", options = {}) {
  const clientId = typeof clientIdOrWs === "string" ? clientIdOrWs : getClientId(clientIdOrWs);
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
    game: null,
    createdAt: Date.now()
  };
  rooms.set(id, room);
  userRooms.set(clientId, id);

  if (cleanupTimers.has(id)) {
    clearTimeout(cleanupTimers.get(id));
    cleanupTimers.delete(id);
  }

  // Namen sicherstellen
  const uName = getUserName(clientId);
  if (!uName) setUserName(clientId, `Gast-${clientId}`);

  broadcastToPlayers([clientId], makeRoomState(room));
  updateRoomList();
  return id;
}

export function joinRoom(clientIdOrWs, roomId) {
  const clientId = typeof clientIdOrWs === "string" ? clientIdOrWs : getClientId(clientIdOrWs);
  if (!clientId) return false;
  const room = rooms.get(roomId);
  if (!room) return false;

  // evtl. alten Raum verlassen
  const prev = userRooms.get(clientId);
  if (prev && prev !== roomId) leaveRoom(clientId);

  if (room.players.includes(clientId)) {
    if (cleanupTimers.has(roomId)) {
      clearTimeout(cleanupTimers.get(roomId));
      cleanupTimers.delete(roomId);
    }
    broadcastToPlayers(room.players, makeRoomState(room));
    return true;
  }

  if (room.players.length >= room.maxPlayers) return false;

  // Name garantieren
  let uName = getUserName(clientId);
  if (!uName) {
    uName = `Gast-${clientId}`;
    setUserName(clientId, uName);
  }

  room.players.push(clientId);
  userRooms.set(clientId, roomId);

  if (cleanupTimers.has(roomId)) {
    clearTimeout(cleanupTimers.get(roomId));
    cleanupTimers.delete(roomId);
  }

  // aktualisierten Zustand an alle senden
  const updated = makeRoomState(room);
  broadcastToPlayers(room.players, updated);
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
    owner: getUserName(r.ownerId) || `Gast-${r.ownerId}`,
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    options: r.options || {}
  }));
  broadcast({ type: "room_update", rooms: list });
}
