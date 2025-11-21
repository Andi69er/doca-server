// roomManager.js (FINALE, STABILE VERSION 10.0 - Grace-Period-Fix)
import { broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map(); // clientId -> roomId
const roomDeletionTimers = new Map(); // roomId -> timerId

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.ownerUsername,
        playerCount: r.playerNames.filter(p => p).length,
        maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
        options: r.options,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "game_state",
        id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players,
        playerNames: room.playerNames,
        maxPlayers: room.maxPlayers, 
        options: room.options, ...gameState,
    };
}

export function createRoom(clientId, ownerUsername, name, options) {
    if (!ownerUsername) return;
    if (userRooms.has(clientId)) leaveRoom(clientId);
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, 
        name: name || `Raum von ${ownerUsername}`,
        ownerId: clientId, 
        ownerUsername: ownerUsername,
        players: [clientId, null],
        playerNames: [ownerUsername, null],
        maxPlayers: 2, 
        options: { 
            ...options, 
            startingScore: options.distance,
            // Neue Felder
            bestOf: options.bestOf,
            firstTo: options.firstTo,
            sets: options.sets,
            legsPerSet: options.legsPerSet,
            gameMode: options.gameMode
        }, 
        game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId: roomId });
}

export function joinRoom(clientId, username, roomId) {
    if (!username) return;
    const room = rooms.get(roomId);
    if (!room) return;

    // KERNKORREKTUR 1: Wenn ein Raum beigetreten wird, den Lösch-Timer abbrechen.
    if (roomDeletionTimers.has(roomId)) {
        clearTimeout(roomDeletionTimers.get(roomId));
        roomDeletionTimers.delete(roomId);
        console.log(`Lösch-Timer für Raum ${roomId} abgebrochen.`);
    }

    const playerIndex = room.playerNames.indexOf(username);
    if (playerIndex !== -1) {
        // Fall 1: Spieler verbindet sich neu
        room.players[playerIndex] = clientId;
        if(room.ownerUsername === username) room.ownerId = clientId;
        userRooms.set(clientId, roomId);
    } else {
        // Fall 2: Neuer Spieler
        const emptyIndex = room.playerNames.indexOf(null);
        if (emptyIndex !== -1) {
            room.players[emptyIndex] = clientId;
            room.playerNames[emptyIndex] = username;
            userRooms.set(clientId, roomId);
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
        room.players[playerIndex] = null;
        userRooms.delete(clientId);
        
        // KERNKORREKTUR 2: Raum nicht sofort löschen, sondern Timer starten.
        if (room.players.every(p => p === null)) {
            console.log(`Raum ${roomId} ist leer. Starte 15-Sekunden-Lösch-Timer.`);
            const timer = setTimeout(() => {
                // Erneute Prüfung, falls zwischenzeitlich jemand beigetreten ist
                if (room.players.every(p => p === null)) {
                    rooms.delete(roomId);
                    console.log(`Raum ${roomId} nach Inaktivität endgültig gelöscht.`);
                    broadcastRoomList(); // Alle informieren, dass der Raum weg ist.
                }
                roomDeletionTimers.delete(roomId);
            }, 15000); // 15 Sekunden Grace Period
            roomDeletionTimers.set(roomId, timer);
        } else {
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
        broadcastRoomList();
    }
}

export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room && room.ownerId === clientId && room.players.filter(p=>p).length > 1) {
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
