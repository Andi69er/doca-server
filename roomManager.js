// roomManager.js (VOLLSTÄNDIG - mit korrigierter Join- & Start-Logik)
import { broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map();
const roomDeletionTimers = new Map();

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.ownerUsername,
        playerCount: r.playerNames.filter(p => p).length,
        maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
        variant: r.options.variant, gameInfo: `${r.options.distance} ${r.options.finish}`
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    return {
        type: "game_state", id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players, playerNames: room.playerNames,
        maxPlayers: room.maxPlayers, options: room.options,
        ...(room.game ? room.game.getState() : {})
    };
}

export function createRoom(clientId, ownerUsername, name, options) {
    if (!ownerUsername || userRooms.has(clientId)) return;
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name, ownerId: clientId, ownerUsername,
        players: [clientId, null], playerNames: [ownerUsername, null],
        maxPlayers: 2, options: { ...options, startingScore: options.distance }, game: null
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId });
}

// **KORRIGIERTE JOIN-LOGIK**
export function joinRoom(clientId, username, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    if (roomDeletionTimers.has(roomId)) { clearTimeout(roomDeletionTimers.get(roomId)); roomDeletionTimers.delete(roomId); }

    // Logik für Wiederbeitritt und neuen Spieler
    let playerIndex = room.players.indexOf(clientId);
    if (playerIndex === -1) { // Nicht bereits im Raum, also neuen Platz suchen
        playerIndex = room.players.indexOf(null);
    }
    
    if (playerIndex !== -1) {
        room.players[playerIndex] = clientId;
        room.playerNames[playerIndex] = username;
        userRooms.set(clientId, roomId);
    } else {
        return; // Raum ist voll
    }
    
    // Sende den aktuellen Stand an ALLE Spieler im Raum, um Namen zu synchronisieren
    broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
    broadcastRoomList();
}


export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const playerIndex = room.players.indexOf(clientId);
    if (playerIndex !== -1) {
        room.players[playerIndex] = null; // Client-ID entfernen, aber Platz reserviert lassen
        userRooms.delete(clientId);
        
        // Informiere den verbleibenden Spieler
        broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
        broadcastRoomList();

        // Starte Timer zum Löschen, wenn der Raum komplett leer ist
        if (room.players.every(p => p === null)) {
            const timer = setTimeout(() => {
                rooms.delete(roomId);
                roomDeletionTimers.delete(roomId);
                broadcastRoomList();
            }, 15000);
            roomDeletionTimers.set(roomId, timer);
        }
    }
}

export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (!room) return;
    
    const amOwner = clientId === room.ownerId;
    const starterChoice = room.options.starter;

    // Serverseitige Prüfung, wer starten darf
    let canStart = false;
    if (starterChoice === 'Gegner' && !amOwner) canStart = true;
    if (starterChoice !== 'Gegner' && amOwner) canStart = true; // "Ich" oder "Ausbullen"
    if (!canStart || room.players.filter(p => p).length < 2) return;

    let startingPlayerId = room.ownerId; // Default für "Ich"
    if (starterChoice === 'Gegner') {
        startingPlayerId = room.players.find(p => p !== room.ownerId);
    }
    // "Ausbullen" würde hier eine andere Logik starten, für jetzt startet der Owner
    
    room.game = new Game(room.players, room.options, startingPlayerId); // Übergabe des Startspielers
    broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
}


export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
    }
}