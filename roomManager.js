// roomManager.js (VOLLSTÄNDIG - mit korrigierter startGame Funktion)
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

export function joinRoom(clientId, username, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    if (roomDeletionTimers.has(roomId)) {
        clearTimeout(roomDeletionTimers.get(roomId));
        roomDeletionTimers.delete(roomId);
    }
    const emptyIndex = room.playerNames.indexOf(null);
    if (emptyIndex !== -1) {
        room.players[emptyIndex] = clientId;
        room.playerNames[emptyIndex] = username;
        userRooms.set(clientId, roomId);
    }
    broadcastToPlayers(room.players.filter(p=>p), getFullRoomState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const playerIndex = room.players.indexOf(clientId);
    if (playerIndex !== -1) {
        room.players[playerIndex] = null;
        userRooms.delete(clientId);
        if (room.players.every(p => p === null)) {
            const timer = setTimeout(() => {
                rooms.delete(roomId);
                roomDeletionTimers.delete(roomId);
                broadcastRoomList();
            }, 15000);
            roomDeletionTimers.set(roomId, timer);
        } else {
            broadcastToPlayers(room.players.filter(p=>p), getFullRoomState(room));
        }
        broadcastRoomList();
    }
}

export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (!room) return;
    
    // --- KORREKTUR: Server entscheidet, wer beginnt, basierend auf den Raum-Optionen ---
    const amOwner = clientId === room.ownerId;
    const starterChoice = room.options.starter;
    let canStart = false;
    if (starterChoice === 'Gegner' && !amOwner) canStart = true;
    if (starterChoice !== 'Gegner' && amOwner) canStart = true;
    if (!canStart) return; // Falscher Spieler hat geklickt

    let startingPlayerId = room.ownerId; // Default "Ich"
    if (starterChoice === 'Gegner') {
        startingPlayerId = room.players.find(p => p !== room.ownerId);
    }
    // "Ausbullen" würde hier eine andere Logik erfordern, startet aber erstmal mit dem Owner
    
    room.game = new Game(room.players, room.options, startingPlayerId); // startingPlayerId wird übergeben
    broadcastToPlayers(room.players.filter(p=>p), getFullRoomState(room));
}


export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players.filter(p=>p), getFullRoomState(room));
    }
}