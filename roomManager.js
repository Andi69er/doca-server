// roomManager.js (FINAL & CORRECTED OWNER LOGIC)
import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map();

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: getUserName(r.ownerId),
        playerCount: r.players.filter(p => p !== null).length, 
        maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    const connectedPlayers = room.players.filter(pId => pId !== null);
    return {
        type: room.game ? "game_state" : "room_state",
        id: room.id, name: room.name, ownerId: room.ownerId,
        players: connectedPlayers,
        playerNames: connectedPlayers.map(pId => getUserName(pId)),
        maxPlayers: room.maxPlayers, options: room.options,
        ...(room.game ? room.game.getState() : {})
    };
}

export function createRoom(clientId, name, options) {
    if (userRooms.has(clientId)) leaveRoom(clientId);
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${getUserName(clientId)}`, 
        players: [clientId, null], 
        ownerId: clientId, // Wird hier gesetzt und nie wieder geändert.
        maxPlayers: 2, options, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    sendToClient(clientId, getFullRoomState(room));
    broadcastRoomList();
}

export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room) return sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });

    // Wenn ein Spieler, der schon einen Platz im Raum hat, sich wiederverbindet (z.B. nach Refresh)
    const user = users.get(clientId);
    if (user) {
        const existingOwner = users.get(room.ownerId);
        if (existingOwner && existingOwner.username === user.username && room.players[0] === null) {
            room.players[0] = clientId;
            userRooms.set(clientId, roomId);
            broadcastToPlayers(room.players.filter(p => p !== null), getFullRoomState(room));
            broadcastRoomList();
            return;
        }
    }
    
    if (userRooms.has(clientId)) leaveRoom(clientId);

    const emptySlotIndex = room.players.indexOf(null);
    if (emptySlotIndex !== -1) {
        room.players[emptySlotIndex] = clientId;
        userRooms.set(clientId, roomId);
    } else {
        return;
    }
    
    broadcastToPlayers(room.players.filter(p => p !== null), getFullRoomState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    userRooms.delete(clientId);

    if (room) {
        const playerIndex = room.players.indexOf(clientId);
        if (playerIndex !== -1) {
            // Wir setzen den Slot auf 'null', um die Reihenfolge beizubehalten.
            room.players[playerIndex] = null;
        }

        const remainingPlayers = room.players.filter(p => p !== null);

        if (remainingPlayers.length === 0) {
            setTimeout(() => {
                const currentRoom = rooms.get(roomId);
                if (currentRoom && currentRoom.players.every(p => p === null)) {
                    rooms.delete(roomId);
                    broadcastRoomList();
                }
            }, 10000); // Erhöhte Wartezeit für Stabilität
        } else {
            // WICHTIG: Der ownerId wird NICHT mehr geändert.
            broadcastToPlayers(remainingPlayers, getFullRoomState(room));
            broadcastRoomList();
        }
    }
}

export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    const connectedPlayers = room ? room.players.filter(p => p !== null) : [];
    if (room && room.ownerId === clientId && connectedPlayers.length > 1) {
        room.game = new Game(connectedPlayers, room.options);
        broadcastToPlayers(connectedPlayers, getFullRoomState(room));
    }
}

export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players.filter(p => p !== null), getFullRoomState(room));
    }
}