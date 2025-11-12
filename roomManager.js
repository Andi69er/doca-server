// roomManager.js (FINAL & ROBUST LOGIC)
import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map();

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => {
        const connectedPlayers = r.players.filter(p => p !== null);
        return {
            id: r.id, name: r.name, owner: getUserName(r.ownerId),
            playerCount: connectedPlayers.length, maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
        }
    });
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    
    // Wichtig: Filtere 'null' Werte aus der Spielerliste, bevor sie an den Client gesendet wird
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
        // Wir erstellen feste "Slots", um die Reihenfolge beizubehalten. Der Ersteller ist immer an Position 0.
        players: [clientId, null], 
        ownerId: clientId, // Der Ersteller ist und bleibt der Besitzer.
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

    if (userRooms.has(clientId)) leaveRoom(clientId);

    // Finde den ersten freien Slot (null) und platziere den Spieler dort.
    const emptySlotIndex = room.players.indexOf(null);
    if (emptySlotIndex !== -1) {
        room.players[emptySlotIndex] = clientId;
        userRooms.set(clientId, roomId);
    } else {
        // Optional: Fehler senden, wenn kein Platz frei ist
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
        // Finde den Spieler und setze seinen Slot auf 'null', anstatt ihn zu löschen.
        // Das bewahrt die Reihenfolge.
        const playerIndex = room.players.indexOf(clientId);
        if (playerIndex !== -1) {
            room.players[playerIndex] = null;
        }

        const remainingPlayers = room.players.filter(p => p !== null);

        if (remainingPlayers.length === 0) {
            // Wenn alle Slots leer sind, lösche den Raum nach kurzer Zeit.
            setTimeout(() => {
                const currentRoom = rooms.get(roomId);
                if (currentRoom && currentRoom.players.every(p => p === null)) {
                    rooms.delete(roomId);
                    broadcastRoomList();
                }
            }, 5000);
        } else {
            // Informiere die verbleibenden Spieler. Der ownerId bleibt unverändert.
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