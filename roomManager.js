// roomManager.js

import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js"; // Import der neuen Game-Klasse

const rooms = new Map(); // roomId -> Room-Objekt
const userRooms = new Map(); // clientId -> roomId

const GRACE_PERIOD_MS = 30000; // 30 Sekunden, bevor ein leerer Raum gelöscht wird

// Funktion zum Senden der aktualisierten Raumliste an alle Benutzer
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

// Kombinierte Funktion, die den gesamten Zustand eines Raumes (inkl. Spiel) zurückgibt
export function getRoomState(room) {
    const gameState = room.game ? room.game.getState() : null;
    return {
        type: "game_state", // Ein einziger Nachrichtentyp für den gesamten Zustand
        roomId: room.id,
        name: room.name,
        ownerId: room.ownerId,
        players: room.players,
        playerNames: room.players.map(pId => getUserName(pId)),
        ...gameState // Fügt die Spieldaten hinzu
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
        players: [], // Spieler wird erst beim Join hinzugefügt
        maxPlayers: 2,
        options: options,
        createdAt: Date.now(),
        game: null,
        cleanupTimer: null,
    };

    rooms.set(roomId, room);
    console.log(`Raum erstellt: ${room.name} (${roomId}) von ${getUserName(clientId)}`);
    
    // Den Ersteller direkt dem Raum beitreten lassen
    sendToClient(clientId, { type: "room_created", roomId: roomId });
    joinRoom(clientId, roomId);
}

export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room) {
        sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });
        return;
    }

    if (userRooms.has(clientId) && userRooms.get(clientId) !== roomId) {
        leaveRoom(clientId, false); 
    }

    if (room.players.length >= room.maxPlayers && !room.players.includes(clientId)) {
        sendToClient(clientId, { type: "error", message: "Der Raum ist voll." });
        return;
    }

    if (!room.players.includes(clientId)) {
        room.players.push(clientId);
    }
    userRooms.set(clientId, roomId);

    if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
    }

    const roomState = getRoomState(room);
    broadcastToPlayers(room.players, roomState); 
    sendToClient(clientId, { type: "joined_room", ok: true, roomId: roomId });
    
    broadcastRoomList();
}

export function leaveRoom(clientId, doBroadcast = true) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;

    const room = rooms.get(roomId);
    userRooms.delete(clientId);

    if (room) {
        room.players = room.players.filter(pId => pId !== clientId);
        console.log(`${getUserName(clientId)} hat den Raum ${room.name} verlassen`);

        if (room.players.length === 0) {
            room.cleanupTimer = setTimeout(() => {
                rooms.delete(roomId);
                console.log(`Leerer Raum ${roomId} wurde gelöscht.`);
                broadcastRoomList();
            }, GRACE_PERIOD_MS);
        } else {
            if (room.ownerId === clientId) {
                room.ownerId = room.players[0];
            }
            const roomState = getRoomState(room);
            broadcastToPlayers(room.players, roomState);
        }
    }

    if (doBroadcast) {
        broadcastRoomList();
    }
}

export function getRoomByClientId(clientId) {
    const roomId = userRooms.get(clientId);
    return roomId ? rooms.get(roomId) : null;
}

export function startGame(clientId) {
    const room = getRoomByClientId(clientId);
    if (room && room.ownerId === clientId) {
        if (room.players.length < 2) {
             sendToClient(clientId, { type: "error", message: "Nicht genügend Spieler zum Starten." });
             return;
        }
        room.game = new Game(room.players, room.options);
        const roomState = getRoomState(room);
        broadcastToPlayers(room.players, roomState);
        broadcastRoomList();
    } else if (room) {
        sendToClient(clientId, { type: "error", message: "Nur der Host kann das Spiel starten." });
    }
}

export function handleGameAction(clientId, action) {
    const room = getRoomByClientId(clientId);
    if (room && room.game) {
        const stateChanged = room.game.handleAction(clientId, action);
        if (stateChanged) {
            const roomState = getRoomState(room);
            broadcastToPlayers(room.players, roomState);
        } else {
             sendToClient(clientId, { type: "error", message: "Ungültige Spielaktion." });
        }
    }
}