// roomManager.js (FINAL, reparierte Version)

import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map(); // roomId -> Room-Objekt
const userRooms = new Map(); // clientId -> roomId

// Sendet die aktualisierte Raumliste an die Lobby (alle verbundenen Clients)
function broadcastRoomList() {
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

// Stellt den kompletten Zustand eines Raumes zusammen (Spieler, Namen, Spielstand etc.)
function getFullRoomState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "room_state", // Wir verwenden diesen Typ, um die gesamte Raum- und Spielinfo zu bündeln
        id: room.id,
        name: room.name,
        ownerId: room.ownerId,
        players: room.players,
        playerNames: room.players.map(pId => getUserName(pId) || `Gast-${pId}`),
        maxPlayers: room.maxPlayers,
        options: room.options,
        // Fasse die Spiel-Daten hier zusammen
        ...gameState
    };
}

export function createRoom(clientId, name = "Neuer Raum", options = {}) {
    if (userRooms.has(clientId)) {
        sendToClient(clientId, { type: "error", message: "Du bist bereits in einem Raum." });
        return;
    }
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId,
        name: name || `Raum von ${getUserName(clientId)}`,
        ownerId: clientId,
        players: [clientId], // Der Ersteller ist sofort der erste Spieler
        maxPlayers: 2,
        options: options,
        game: null, // Das Spiel wird erst bei Start erstellt
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    console.log(`Raum erstellt: ${room.name} (${roomId}) durch ${getUserName(clientId)}`);
    
    // Sende den initialen Zustand an den Ersteller
    sendToClient(clientId, getFullRoomState(room));
    // Informiere die Lobby über den neuen Raum
    broadcastRoomList();
}

export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room) {
        sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });
        return;
    }
    if (room.players.length >= room.maxPlayers && !room.players.includes(clientId)) {
        sendToClient(clientId, { type: "error", message: "Der Raum ist voll." });
        return;
    }

    if (!room.players.includes(clientId)) {
        room.players.push(clientId);
    }
    userRooms.set(clientId, roomId);
    
    console.log(`${getUserName(clientId)} ist dem Raum ${room.name} beigetreten.`);

    // **DER ENTSCHEIDENDE FIX:** Sende den neuen, kompletten Zustand an ALLE Spieler im Raum
    broadcastToPlayers(room.players, getFullRoomState(room));
    
    // Informiere die Lobby, dass sich die Spielerzahl geändert hat
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    userRooms.delete(clientId);

    if (room) {
        const remainingPlayers = room.players.filter(pId => pId !== clientId);
        room.players = remainingPlayers;

        if (remainingPlayers.length === 0) {
            // Wenn der Raum leer ist, wird er nach 30 Sekunden gelöscht
            setTimeout(() => {
                if (room.players.length === 0) {
                    rooms.delete(roomId);
                    console.log(`Leerer Raum ${roomId} wurde gelöscht.`);
                    broadcastRoomList();
                }
            }, 30000);
        } else {
            // Es sind noch Spieler da. Update senden.
            if (room.ownerId === clientId) {
                room.ownerId = remainingPlayers[0]; // Der nächste Spieler wird Host
            }
            broadcastToPlayers(remainingPlayers, getFullRoomState(room));
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
        if (room.players.length < 2) {
             sendToClient(clientId, { type: "error", message: "Warte auf Gegner..." });
             return;
        }
        room.game = new Game(room.players, room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const room = getRoomByClientId(clientId);
    if (room && room.game) {
        const stateChanged = room.game.handleAction(clientId, action);
        if (stateChanged) {
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
    }
}