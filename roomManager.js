// roomManager.js — DOCA WebDarts PRO (robust, copy & paste)
// WICHTIG: ersetzt die bisherige roomManager.js

import { broadcast, broadcastToPlayers, getUserName } from "./userManager.js";

globalThis.rooms = {};            // roomId -> room
globalThis.roomCleanupTimers = {}; // roomId -> timeoutId

/**
 * Build a safe pre-game room state for broadcasting.
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
    currentPlayerId: room.game ? (room.game.players?.[room.game.currentPlayerIndex] ?? null) : null,
    winner: room.game?.winner ?? null,
    options: room.options || {},
    liveStats: room.game ? (room.game.getState?.().liveStats || {}) : {},
    isFull: room.players.length >= (room.maxPlayers || 2),
    ownerId: room.ownerId
  };
}

/**
 * Create a new room. Does NOT duplicate join if already in room.
 * Auto-joins the creator (only if not already in a room).
 */
export function createRoom(clientId, name = "Neuer Raum", options = {}) {
  // if client already in a room, return that room id instead of creating new
  const existing = globalThis.userRooms?.[clientId];
  if (existing && globalThis.rooms?.[existing]) {
    // update options/name if desired
    const r = globalThis.rooms[existing];
    r.name = name || r.name;
    r.options = Object.assign({}, r.options || {}, options || {});
    updateRoomList();
    return r.id;
  }

  const id = Math.random().toString(36).substring(2, 8);
  const room = {
    id,
    name,
    ownerId: clientId,
    players: [],
    maxPlayers: 2,
    options: Object.assign({}, options || {}),
    game: null,
    createdAt: Date.now()
  };
  globalThis.rooms[id] = room;

  // ensure any pending cleanup for this room is cancelled
  if (globalThis.roomCleanupTimers[id]) {
    clearTimeout(globalThis.roomCleanupTimers[id]);
    delete globalThis.roomCleanupTimers[id];
  }

  // auto-join creator
  joinRoom(clientId, id);

  // broadcast updated room list
  updateRoomList();
  return id;
}

/**
 * Join a client into a room (safe, idempotent).
 * Cancels room deletion timers when players arrive.
 */
export function joinRoom(clientId, roomId) {
  const room = globalThis.rooms[roomId];
  if (!room) return;

  // If client is already in that room, nothing to do
  if (room.players.includes(clientId)) {
    // still ensure that room cleanup timer is cleared
    if (globalThis.roomCleanupTimers[roomId]) {
      clearTimeout(globalThis.roomCleanupTimers[roomId]);
      delete globalThis.roomCleanupTimers[roomId];
    }
    // publish current room state to that client
    broadcastToPlayers(room.players, getRoomState(roomId));
    updateRoomList();
    return;
  }

  // If client is in a different room, leave previous one first (doUpdate=false to avoid double update)
  const prev = globalThis.userRooms?.[clientId];
  if (prev && prev !== roomId) {
    leaveRoom(clientId, false);
  }

  // add to room if space
  if (!room.players.includes(clientId) && room.players.length < room.maxPlayers) {
    room.players.push(clientId);
    if (!globalThis.userRooms) globalThis.userRooms = {};
    globalThis.userRooms[clientId] = roomId;
  }

  // if there was a pending cleanup timer for this room, cancel it
  if (globalThis.roomCleanupTimers[roomId]) {
    clearTimeout(globalThis.roomCleanupTimers[roomId]);
    delete globalThis.roomCleanupTimers[roomId];
  }

  // notify all players in the room with the full room state
  broadcastToPlayers(room.players, getRoomState(roomId));
  // update lobby room list
  updateRoomList();
}

/**
 * Leave the room for a client.
 * If the room becomes empty, schedule cleanup after a grace period.
 * If doUpdate === false, skip updateRoomList (used for internal reassignments).
 */
export function leaveRoom(clientId, doUpdate = true) {
  if (!globalThis.userRooms) return;
  const rid = globalThis.userRooms[clientId];
  if (!rid || !globalThis.rooms[rid]) {
    // nothing to do
    delete globalThis.userRooms[clientId];
    return;
  }

  const room = globalThis.rooms[rid];
  room.players = room.players.filter(p => p !== clientId);
  delete globalThis.userRooms[clientId];

  // If owner left but players remain, transfer ownership to first remaining player
  if (room.ownerId === clientId) {
    if (room.players.length > 0) {
      room.ownerId = room.players[0];
    } else {
      room.ownerId = null;
    }
  }

  // If a game was running, keep it but notify remaining players
  if (room.game) {
    if (room.players.length === 0) {
      // no players left — clear game state and schedule room cleanup below
      room.game = null;
    } else {
      // inform remaining players about changed state
      broadcastToPlayers(room.players, getRoomState(rid));
    }
  }

  // If room empty -> schedule deletion after GRACE_PERIOD (don't delete immediately)
  const GRACE_PERIOD_MS = 30 * 1000; // 30 seconds
  if (room.players.length === 0) {
    // If already scheduled, clear and reschedule to extend time
    if (globalThis.roomCleanupTimers[rid]) {
      clearTimeout(globalThis.roomCleanupTimers[rid]);
      delete globalThis.roomCleanupTimers[rid];
    }
    globalThis.roomCleanupTimers[rid] = setTimeout(() => {
      try {
        // double-check still empty
        const roomNow = globalThis.rooms[rid];
        if (!roomNow) return;
        if (roomNow.players && roomNow.players.length === 0) {
          delete globalThis.rooms[rid];
        }
        // cleanup timer entry
        if (globalThis.roomCleanupTimers[rid]) {
          clearTimeout(globalThis.roomCleanupTimers[rid]);
          delete globalThis.roomCleanupTimers[rid];
        }
        // after deletion, broadcast updated list
        updateRoomList();
      } catch (e) {
        console.error("room cleanup error", e);
      }
    }, GRACE_PERIOD_MS);
  } else {
    // room still has players -> ensure no cleanup timer is set
    if (globalThis.roomCleanupTimers[rid]) {
      clearTimeout(globalThis.roomCleanupTimers[rid]);
      delete globalThis.roomCleanupTimers[rid];
    }
  }

  if (doUpdate) updateRoomList();
}

/**
 * Return the room object for a given clientId (or null).
 */
export function getRoomByClientId(cid) {
  const rid = globalThis.userRooms?.[cid];
  return rid ? globalThis.rooms[rid] : null;
}

/**
 * Broadcast the list of rooms to the lobby.
 * Includes basic room metadata.
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
