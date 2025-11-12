// serverdaten/roomManager.js (FINALE, STABILE VERSION 6.0 - Namens-Fix)
import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map(); // clientId -> roomId

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.ownerUsername,
        playerCount: r.playerNames.filter(p => p).length, // Zähle die Namen, nicht die IDs
        maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    const gameState = room.game ? room.game.getState() : {};
    
    // KERNKORREKTUR: Wir verwenden die im Raum gespeicherte playerNames-Liste als
    // garantierte Quelle der Wahrheit. Kein fehleranfälliges Nachschlagen mehr.
    return {
        type: "game_state",
        id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players,
        playerNames: room.playerNames, // Diese Liste wird jetzt direkt verwendet.
        maxPlayers: room.maxPlayers, options: room.options, ...gameState,
    };
}

export function createRoom(clientId, name, options) {
    if (userRooms.has(clientId)) leaveRoom(clientId);
    const ownerUsername = getUserName(clientId);
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${ownerUsername}`,
        ownerId: clientId, ownerUsername: ownerUsername,
        players: [clientId, null],
        playerNames: [ownerUsername, null], // Die Namensliste wird hier initial korrekt erstellt.
        maxPlayers: 2, options: { ...options, startingScore: options.distance }, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId: roomId });
}

export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const username = getUserName(clientId);

    const playerIndex = room.playerNames.indexOf(username);
    if (playerIndex !== -1) {
        // Fall 1: Spieler verbindet sich neu
        room.players[playerIndex] = clientId;
        if(room.ownerUsername === username) room.ownerId = clientId;
        userRooms.set(clientId, roomId);
        console.log(`[${username}] hat sich neu verbunden in Slot ${playerIndex}.`);
    } else {
        // Fall 2: Neuer Spieler
        const emptyIndex = room.playerNames.indexOf(null);
        if (emptyIndex !== -1) {
            room.players[emptyIndex] = clientId;
            room.playerNames[emptyIndex] = username; // Der Name wird hier dem Slot zugewiesen.
            userRooms.set(clientId, roomId);
            console.log(`[${username}] ist beigetreten in Slot ${emptyIndex}.`);
        }
    }
    broadcastToPlayers(room.players, getFullRoomState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const playerIndex = room.players.indexOf(clientId);

    if (playerIndex !== -1) {
        console.log(`[${room.playerNames[playerIndex]}] hat Verbindung getrennt. Slot ${playerIndex} wird reserviert.`);
        room.players[playerIndex] = null; // ID entfernen, aber der Name im playerNames-Array bleibt als Platzhalter.
        userRooms.delete(clientId);
        broadcastToPlayers(room.players, getFullRoomState(room)); // Informiere die anderen Spieler
        broadcastRoomList();
    }
}

export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room && room.ownerId === clientId && room.players.filter(p=>p).length > 1) {
        // Nur die aktiven Client-IDs an das Spiel übergeben
        room.game = new Game(room.players.filter(p=>p), room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}

export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}