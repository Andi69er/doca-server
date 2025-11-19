// serverdaten/roomManager.js
import { broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";
import CricketGame from "./cricketGame.js";

const rooms = new Map();
const userRooms = new Map();
const roomDeletionTimers = new Map();

function now() { return (new Date()).toISOString(); }

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.ownerUsername,
        playerCount: r.playerNames.filter(p => p).length,
        maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
        gameMode: r.gameMode || "x01"
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "game_state",
        id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players,
        playerNames: room.playerNames,
        maxPlayers: room.maxPlayers,
        options: room.options,
        gameMode: room.gameMode || "x01",
        ...gameState,
    };
}

export function createRoom(clientId, ownerUsername, name, options = {}) {
    if (!ownerUsername) return;
    if (userRooms.has(clientId)) leaveRoom(clientId);
    const roomId = Math.random().toString(36).slice(2, 9);
    const gameMode = options.variant === "cricket" ? "cricket" : "x01";

    const room = {
        id: roomId,
        name: name || `Raum von ${ownerUsername}`,
        ownerId: clientId,
        ownerUsername: ownerUsername,
        players: [clientId, null],
        playerNames: [ownerUsername, null],
        maxPlayers: 2,
        options: options,
        game: null,
        gameMode: gameMode
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId });
}

export function joinRoom(clientId, username, roomId) {
    if (!username || !roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (roomDeletionTimers.has(roomId)) {
        clearTimeout(roomDeletionTimers.get(roomId));
        roomDeletionTimers.delete(roomId);
    }

    const existing = room.playerNames.indexOf(username);
    if (existing !== -1) {
        room.players[existing] = clientId;
        if (room.ownerUsername === username) room.ownerId = clientId;
        userRooms.set(clientId, roomId);
    } else {
        const slot = room.players.indexOf(null);
        if (slot !== -1) {
            room.players[slot] = clientId;
            room.playerNames[slot] = username;
            userRooms.set(clientId, roomId);
        }
    }

    broadcastToPlayers(room.players.filter(Boolean), getFullRoomState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const idx = room.players.indexOf(clientId);
    if (idx !== -1) {
        room.players[idx] = null;
        userRooms.delete(clientId);
        if (room.players.every(p => !p)) {
            const timer = setTimeout(() => {
                if (rooms.has(roomId) && rooms.get(roomId).players.every(p => !p)) {
                    rooms.delete(roomId);
                    broadcastRoomList();
                }
                roomDeletionTimers.delete(roomId);
            }, 15000);
            roomDeletionTimers.set(roomId, timer);
        } else {
            broadcastToPlayers(room.players.filter(Boolean), getFullRoomState(room));
            broadcastRoomList();
        }
    }
}

export function startGame(ownerId, opts = {}) {
    const roomId = userRooms.get(ownerId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.ownerId !== ownerId) return;

    const actualPlayers = room.players.filter(p => p);
    if (actualPlayers.length < 2) return;

    if (room.gameMode === "cricket") {
        room.game = new CricketGame(actualPlayers, room.options);
    } else {
        room.game = new Game(actualPlayers, room.options);
    }

    broadcastToPlayers(actualPlayers, getFullRoomState(room));
    broadcastRoomList();
}

export function handleGameAction(clientId, action) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || !room.game) return;

    const valid = room.game.handleAction(clientId, action);
    if (valid) {
        broadcastToPlayers(room.players.filter(Boolean), getFullRoomState(room));
    }
}