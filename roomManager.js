// roomManager.js (FINAL - Robust Logic)
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
    createdAt: room.createdAt
  };
}

export function createRoom(clientIdOrWs, name = "Neuer Raum", options = {}) {
  const clientId = typeof clientIdOrWs === "string" ? clientIdOrWs : getClientId(clientIdOrWs);
  if (!clientId) return null;

  if (userRooms.has(clientId)) {
    const existingRoomId = userRooms.get(clientId);
    const existingRoom = rooms.get(existingRoomId);
    if (existingRoom) { return existingRoomId; }
    userRooms.delete(clientId);
  }

  const id = Math.random().toString(36).slice(2, 9);
  const room = { id, name, ownerId: clientId, players: [clientId], options, maxPlayers: 2, game: null, createdAt: Date.now() };
  rooms.set(id, room);
  userRooms.set(clientId, id);

  if (cleanupTimers.has(id)) { clearTimeout(cleanupTimers.get(id)); cleanupTimers.delete(id); }

  updateRoomList();
  try { broadcastToPlayers([clientId], { type: "room_created", roomId: id, name }); } catch {}
  return id;
}

export function joinRoom(clientIdOrWs, roomId) {
  const clientId = typeof clientIdOrWs === "string" ? clientIdOrWs : getClientId(clientIdOrWs);
  if (!clientId) return false;
  const room = rooms.get(roomId);
  if (!room) return false;

  if (room.players.includes(clientId)) {
    if (cleanupTimers.has(roomId)) { clearTimeout(cleanupTimers.get(roomId)); cleanupTimers.delete(roomId); }
    broadcastToPlayers(room.players, makeRoomState(room));
    updateRoomList();
    return true;
  }

  const prevRoomId = userRooms.get(clientId);
  if (prevRoomId && prevRoomId !== roomId) { leaveRoom(clientId); }

  if (room.players.length >= room.maxPlayers) return false;
  room.players.push(clientId);
  userRooms.set(clientId, roomId);

  if (cleanupTimers.has(roomId)) { clearTimeout(cleanupTimers.get(roomId)); cleanupTimers.delete(roomId); }

  broadcastToPlayers(room.players, makeRoomState(room));
  updateRoomList();
  return true;
}

export function leaveRoom(clientIdOrWs) {
  const clientId = typeof clientIdOrWs === "string" ? clientIdOrWs : getClientId(clientIdOrWs);
  if (!clientId) return false;
  const roomId = userRooms.get(clientId);
  if (!roomId) return false;
  const room = rooms.get(roomId);
  userRooms.delete(clientId);

  if (!room) { return false; }

  const playerIndex = room.players.indexOf(clientId);
  if (playerIndex > -1) { room.players.splice(playerIndex, 1); }

  if (room.ownerId === clientId) { room.ownerId = room.players[0] || null; }

  if (room.players.length === 0) {
    if (cleanupTimers.has(roomId)) clearTimeout(cleanupTimers.get(roomId));
    const timer = setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      if (currentRoom && currentRoom.players.length === 0) {
        rooms.delete(roomId);
        console.log(`Raum ${roomId} wurde nach Inaktivität gelöscht.`);
        updateRoomList();
      }
      cleanupTimers.delete(roomId);
    }, GRACE_MS);
    cleanupTimers.set(roomId, timer);
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
    owner: getUserName(r.ownerId) || "Gast",
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    options: r.options || {}
  }));
  broadcast({ type: "room_update", rooms: list });
}