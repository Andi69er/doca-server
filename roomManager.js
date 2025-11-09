// roomManager.js — DOCA WebDarts PRO
// Vollständige Datei — Copy & Paste

import { broadcast, sendToClient, getUserName, broadcastToPlayers } from "./userManager.js";

globalThis.rooms = {}; // roomId -> room

/**
 * Return a clean "pre-game" room state (used for broadcasting to lobby & players)
 */
export function getRoomState(roomId) {
  const room = globalThis.rooms[roomId];
  if (!room) return null;
  return {
    type: "game_state",
    isStarted: !!room.game?.isStarted,
    players: room.players.slice(),
    playerNames: room.players.map(pid => getUserName(pid)),
    scores: room.players.reduce((acc, pid) => {
      acc[pid] = parseInt(room.options?.distance) || 501;
      return acc;
    }, {}),
    currentPlayerId: room.game ? room.game.players[room.game.currentPlayerIndex] : null,
    winner: room.game?.winner ?? null,
    options: room.options || {},
    liveStats: room.game ? (room.game.getState().liveStats || {}) : {},
    isFull: room.players.length >= room.maxPlayers,
    ownerId: room.ownerId
  };
}

/**
 * Create a new room and auto-join the creating client.
 */
export function createRoom(clientId, name = "Neuer Raum", options = {}) {
  const id = Math.random().toString(36).substring(2, 8);
  const room = { id, name, ownerId: clientId, players: [], maxPlayers: 2, options, game: null };
  globalThis.rooms[id] = room;
  // auto join the creator
  joinRoom(clientId, id);
  updateRoomList();
}

/**
 * Join a client into a room (safe).
 */
export function joinRoom(clientId, roomId) {
  const room = globalThis.rooms[roomId];
  if (!room) return;
  // leave previous room if any
  leaveRoom(clientId, false);

  if (!room.players.includes(clientId) && room.players.length < room.maxPlayers) {
    room.players.push(clientId);
    globalThis.userRooms[clientId] = roomId;
  }
  // Notify all players in that room of the updated room state
  broadcastToPlayers(room.players, getRoomState(roomId));
  // Also update lobby list
  updateRoomList();
}

/**
 * Leave the room for a client
 * doUpdate: whether to broadcast the room list update
 */
export function leaveRoom(clientId, doUpdate = true) {
  const rid = globalThis.userRooms[clientId];
  if (!rid || !globalThis.rooms[rid]) return;

  const room = globalThis.rooms[rid];
  room.players = room.players.filter(p => p !== clientId);
  delete globalThis.userRooms[clientId];

  // If game exists, and player left mid-game: stop game safely
  if (room.game) {
    // if no players left, cleanup game
    if (room.players.length === 0) {
      room.game = null;
    } else {
      // If owner left, transfer ownership
      if (room.ownerId === clientId) {
        room.ownerId = room.players[0];
      }
      // Inform remaining players about changed room state
      broadcastToPlayers(room.players, getRoomState(rid));
    }
  }

  // If room empty -> delete it
  if (room.players.length === 0) {
    delete globalThis.rooms[rid];
  }

  if (doUpdate) updateRoomList();
}

/**
 * Return the room object for a given clientId (or null).
 */
export function getRoomByClientId(cid) {
  const rid = globalThis.userRooms[cid];
  return rid ? globalThis.rooms[rid] : null;
}

/**
 * Broadcast the list of rooms to the lobby.
 */
export function updateRoomList() {
  const list = Object.values(globalThis.rooms).map((r) => ({
    id: r.id,
    name: r.name,
    owner: getUserName(r.ownerId),
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    ...(r.options || {})
  }));
  broadcast({ type: "room_update", rooms: list });
}
