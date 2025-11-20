// roomManager.js (FINALE, STABILE VERSION 12.0 - Robuste Start-Logik)
import { broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map();
const roomDeletionTimers = new Map();

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => {
        let gameInfo = 'Unbekannt';
        if (r.options) {
            if (r.options.variant === 'cricket') gameInfo = 'Cricket';
            else gameInfo = `${r.options.distance || 501} ${r.options.finish?.includes('Double') ? 'DO' : 'SO'}`;
        }
        return {
            id: r.id, name: r.name, owner: r.ownerUsername,
            playerCount: r.playerNames.filter(p => p).length,
            maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
            variant: r.options.variant || 'x01', gameInfo
        };
    });
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    return {
        type: "game_state",
        id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players, playerNames: room.playerNames,
        maxPlayers: room.maxPlayers, options: room.options,
        ...(room.game ? room.game.getState() : {})
    };
}

export function createRoom(clientId, ownerUsername, name, options) {
    if (!ownerUsername || userRooms.has(clientId)) return;
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${ownerUsername}`,
        ownerId: clientId, ownerUsername: ownerUsername,
        players: [clientId, null], playerNames: [ownerUsername, null],
        maxPlayers: 2, options, game: null
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId: roomId });
}

export function joinRoom(clientId, username, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    if (roomDeletionTimers.has(roomId)) {
        clearTimeout(roomDeletionTimers.get(roomId));
        roomDeletionTimers.delete(roomId);
    }
    const playerIndex = room.playerNames.indexOf(username);
    if (playerIndex !== -1) {
        room.players[playerIndex] = clientId;
        if (room.ownerUsername === username) room.ownerId = clientId;
    } else {
        const emptyIndex = room.players.indexOf(null);
        if (emptyIndex !== -1) {
            room.players[emptyIndex] = clientId;
            room.playerNames[emptyIndex] = username;
        }
    }
    userRooms.set(clientId, roomId);
    broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    const room = rooms.get(roomId);
    if (!room) return;

    const playerIndex = room.players.indexOf(clientId);
    if (playerIndex !== -1) {
        room.players[playerIndex] = null; // Behalte den Namen, aber entferne die ClientId
        userRooms.delete(clientId);
        
        if (room.players.every(p => p === null)) {
            const timer = setTimeout(() => {
                rooms.delete(roomId);
                roomDeletionTimers.delete(roomId);
                broadcastRoomList();
            }, 15000);
            roomDeletionTimers.set(roomId, timer);
        } else {
            broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
        }
        broadcastRoomList();
    }
}

export function startGame(clientId, payload) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (!room || room.players.filter(p=>p).length < 2) return;

    // --- KORRIGIERTE SERVER-SEITIGE PRÜFUNG ---
    const amIOwner = clientId === room.ownerId;
    const starterOption = room.options.starter || 'Ich';
    let canStart = false;
    if ((starterOption === 'Ich' || starterOption === 'Ausbullen') && amIOwner) canStart = true;
    if (starterOption === 'Gegner' && !amIOwner) canStart = true;
    
    if (canStart) {
        // Wer tatsächlich beginnt, wird vom Game-Objekt gehandhabt (oder hier explizit gesetzt)
        let startingPlayerId = room.players[0]; // Default: Owner
        if(starterOption === 'Gegner') {
            startingPlayerId = room.players.find(p => p !== room.ownerId);
        }
        // "Ausbullen" Logik würde hier eine andere Sequenz starten
        
        room.game = new Game(room.players, room.options, startingPlayerId);
        broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
    }
}

export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
    }
}