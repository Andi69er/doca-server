// roomManager.js (FINAL)

import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map();

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        owner: getUserName(room.ownerId),
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        isStarted: !!room.game && room.game.isStarted,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "room_state",
        id: room.id,
        name: room.name,
        ownerId: room.ownerId,
        players: room.players,
        playerNames: room.players.map(pId => getUserName(pId) || `Gast-${pId}`),
        maxPlayers: room.maxPlayers,
        options: room.options,
        ...gameState
    };
}

export function createRoom(clientId, name = "Neuer Raum", options = {}) {
    if (userRooms.has(clientId)) {
        leaveRoom(clientId); // Verlasse alten Raum, falls vorhanden
    }
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId,
        name: name || `Raum von ${getUserName(clientId)}`,
        ownerId: clientId,
        players: [clientId],
        maxPlayers: 2,
        options: options,
        game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    console.log(`Raum erstellt: ${room.name} (${roomId})`);
    
    sendToClient(clientId, getFullRoomState(room));
    broadcastRoomList();
}

export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room) return sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });
    if (userRooms.has(clientId) && userRooms.get(clientId) !== roomId) leaveRoom(clientId);
    if (room.players.length >= room.maxPlayers && !room.players.includes(clientId)) return sendToClient(clientId, { type: "error", message: "Der Raum ist voll." });

    if (!room.players.includes(clientId)) room.players.push(clientId);
    userRooms.set(clientId, roomId);
    
    console.log(`${getUserName(clientId)} ist Raum ${room.name} beigetreten.`);
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
            setTimeout(() => {
                if (room.players.length === 0) {
                    rooms.delete(roomId);
                    console.log(`Leerer Raum ${roomId} gelöscht.`);
                    broadcastRoomList();
                }
            }, 30000);
        } else {
            if (room.ownerId === clientId) room.ownerId = room.players[0];
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
    }
    broadcastRoomList();
}

export function getRoomByClientId(clientId) {
    const roomId = userRooms.get(clientId);
    return roomId ? rooms.get(roomId) : null;
}

export function startGame(clientId) {
    const room = getRoomByClientId(clientId);
    if (room && room.ownerId === clientId) {
        if (room.players.length < 2) return sendToClient(clientId, { type: "error", message: "Warte auf Gegner..." });
        room.game = new Game(room.players, room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const room = getRoomByClientId(clientId);
    if (room && room.game) {
        if (room.game.handleAction(clientId, action)) {
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
    }
}