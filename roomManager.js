// roomManager.js (FINAL, VERIFIED & CORRECTED)
import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map();

// HIER IST DAS KORRIGIERTE 'export'
export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: getUserName(r.ownerId),
        playerCount: r.players.length, maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "room_state", id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players, playerNames: room.players.map(pId => getUserName(pId)),
        maxPlayers: room.maxPlayers, options: room.options, ...gameState,
    };
}

export function createRoom(clientId, name, options) {
    if (userRooms.has(clientId)) leaveRoom(clientId);
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${getUserName(clientId)}`, ownerId: clientId,
        players: [clientId], maxPlayers: 2, options, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    sendToClient(clientId, getFullRoomState(room));
    broadcastRoomList();
}

export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room) return sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });
    if (userRooms.has(clientId) && userRooms.get(clientId) !== roomId) leaveRoom(clientId);
    if (room.players.length >= room.maxPlayers && !room.players.includes(clientId)) return;

    if (!room.players.includes(clientId)) room.players.push(clientId);
    userRooms.set(clientId, roomId);
    broadcastToPlayers(room.players, getFullRoomState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    userRooms.delete(clientId);
    if (room) {
        room.players = room.players.filter(pId => pId !== clientId);
        if (room.players.length === 0) {
            setTimeout(() => { if (room.players.length === 0) rooms.delete(roomId) && broadcastRoomList(); }, 30000);
        } else {
            if (room.ownerId === clientId) room.ownerId = room.players[0];
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
    }
    broadcastRoomList();
}

export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room && room.ownerId === clientId && room.players.length > 1) {
        room.game = new Game(room.players, room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}