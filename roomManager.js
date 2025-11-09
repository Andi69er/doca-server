// roomManager.js — DOCA WebDarts PRO
import { broadcast, sendToClient, getUserName, broadcastToPlayers } from "./userManager.js";

globalThis.rooms = {};

// Diese Funktion erstellt einen sauberen "Pre-Game"-Zustand
export function getRoomState(roomId) {
    const room = globalThis.rooms[roomId];
    if (!room) return null;
    return {
        type: "game_state",
        isStarted: false,
        players: room.players,
        playerNames: room.players.map(pid => getUserName(pid)),
        scores: room.players.reduce((acc, pid) => {
            acc[pid] = parseInt(room.options.distance) || 501;
            return acc;
        }, {}),
        currentPlayerId: null,
        winner: null,
        options: room.options,
        liveStats: {},
        isFull: room.players.length === room.maxPlayers,
        ownerId: room.ownerId
    };
}

export function createRoom(clientId, name = "Neuer Raum", options = {}) {
  const id = Math.random().toString(36).substring(2, 8);
  const room = { id, name, ownerId: clientId, players: [], maxPlayers: 2, options, game: null };
  globalThis.rooms[id] = room;
  joinRoom(clientId, id);
}

export function joinRoom(clientId, roomId) {
  const room = globalThis.rooms[roomId];
  if (!room) return;
  
  leaveRoom(clientId, false); 
  
  if (!room.players.includes(clientId) && room.players.length < room.maxPlayers) {
    room.players.push(clientId);
    globalThis.userRooms[clientId] = roomId;
  }
  
  updateRoomList();
}

export function leaveRoom(clientId, doUpdate = true) {
  const rid = globalThis.userRooms[clientId];
  if (!rid || !globalThis.rooms[rid]) return;
  
  const room = globalThis.rooms[rid];
  room.players = room.players.filter((p) => p !== clientId);
  delete globalThis.userRooms[clientId];

  if (room.players.length === 0) {
    delete globalThis.rooms[rid];
  } else {
    if (room.ownerId === clientId) { room.ownerId = room.players[0]; }
    broadcastToPlayers(room.players, getRoomState(rid)); // Verbleibende Spieler informieren
  }
  
  if (doUpdate) {
    updateRoomList();
  }
}

export function getRoomByClientId(cid) {
  const rid = globalThis.userRooms[cid];
  return rid ? globalThis.rooms[rid] : null;
}

export function updateRoomList() {
  const list = Object.values(globalThis.rooms).map((r) => ({
    id: r.id, name: r.name, owner: getUserName(r.ownerId),
    playerCount: r.players.length, maxPlayers: r.maxPlayers,
    ...(r.options || {}),
  }));
  broadcast({ type: "room_update", rooms: list });
}