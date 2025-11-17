// Dateiname: roomManager.js
// FINALE VERSION - Basiert auf deiner funktionierenden "DIAGNOSTIC VERSION"
// mit der EINEN entscheidenden Korrektur in handleGameAction.

import { broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map(); // clientId -> roomId
const roomDeletionTimers = new Map(); // roomId -> timerId

function now() { return (new Date()).toISOString(); }

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.ownerUsername,
        playerCount: r.playerNames.filter(p => p).length,
        maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
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
        id: roomId, name: name || `Raum von ${ownerUsername}`,
        ownerId: clientId, ownerUsername: ownerUsername,
        players: [clientId, null],
        playerNames: [ownerUsername, null],
        maxPlayers: 2, options: { ...options, startingScore: options && options.distance ? options.distance : 501 }, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    console.log(`[${now()}] createRoom: ${roomId} owner=${ownerUsername}(${clientId})`);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId: roomId });
}

export function joinRoom(clientId, username, roomId) {
    console.log(`[${now()}] joinRoom called: client=${clientId} username=${username} roomId=${roomId}`);
    if (!username) return;
    const room = rooms.get(roomId);
    if (!room) {
        console.log(`[${now()}] joinRoom: room not found ${roomId}`);
        sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });
        return;
    }

    if (roomDeletionTimers.has(roomId)) {
        clearTimeout(roomDeletionTimers.get(roomId));
        roomDeletionTimers.delete(roomId);
        console.log(`[${now()}] Lösch-Timer für Raum ${roomId} abgebrochen.`);
    }

    const playerIndex = room.playerNames.indexOf(username);
    if (playerIndex !== -1) {
        room.players[playerIndex] = clientId;
        if(room.ownerUsername === username) room.ownerId = clientId;
        userRooms.set(clientId, roomId);
        console.log(`[${now()}] joinRoom: reconnected ${username} -> slot ${playerIndex}`);
    } else {
        const emptyIndex = room.playerNames.indexOf(null);
        if (emptyIndex !== -1) {
            room.players[emptyIndex] = clientId;
            room.playerNames[emptyIndex] = username;
            userRooms.set(clientId, roomId);
            console.log(`[${now()}] joinRoom: new player ${username} -> slot ${emptyIndex}`);
        } else {
            console.log(`[${now()}] joinRoom: room full ${roomId}`);
            sendToClient(clientId, { type: "error", message: "Raum ist voll." });
            return;
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
        console.log(`[${now()}] leaveRoom: ${clientId} left room ${roomId} (slot ${playerIndex})`);
        
        if (room.players.every(p => p === null)) {
            console.log(`[${now()}] Raum ${roomId} ist leer. Starte 15-Sekunden-Lösch-Timer.`);
            const timer = setTimeout(() => {
                if (room.players.every(p => p === null)) {
                    rooms.delete(roomId);
                    console.log(`[${now()}] Raum ${roomId} nach Inaktivität gelöscht.`);
                    broadcastRoomList();
                }
                roomDeletionTimers.delete(roomId);
            }, 15000);
            roomDeletionTimers.set(roomId, timer);
        } else {
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
        broadcastRoomList();
    }
}

export function startGame(ownerId, opts = {}) {
    const roomId = userRooms.get(ownerId);
    if (!roomId) {
        console.log(`[${now()}] startGame denied: owner ${ownerId} not in any room`);
        return;
    }
    const room = rooms.get(roomId);
    if (!room) {
        console.log(`[${now()}] startGame denied: room ${roomId} missing`);
        return;
    }
    if (room.ownerId !== ownerId) {
        console.log(`[${now()}] startGame denied: ${ownerId} is not owner of ${roomId}`);
        return;
    }

    const actualPlayers = room.players.filter(p => p);
    if (actualPlayers.length < 2) {
        console.log(`[${now()}] startGame aborted: not enough players in ${roomId}`);
        sendToClient(ownerId, { type: "error", message: "Nicht genug Spieler zum Starten." });
        return;
    }

    const gameOptions = Object.assign({}, room.options || {}, opts.options || {});
    if (opts.startingMode) gameOptions.startingMode = opts.startingMode;
    if (opts.startingPlayerId) gameOptions.startingPlayerId = opts.startingPlayerId;

    console.log(`[${now()}] startGame invoked by owner=${ownerId} room=${roomId} opts.startingPlayerId=${gameOptions.startingPlayerId || '(none)'} opts.startingMode=${gameOptions.startingMode || '(none)'}`);

    room.game = new Game(actualPlayers, gameOptions);

    broadcastToPlayers(room.players, getFullRoomState(room));
    sendToClient(ownerId, { type: "debug_game_started", startingPlayerId: room.game.players[room.game.currentPlayerIndex], timestamp: now() });
    broadcastToPlayers(room.players, { type: "debug_first_player", startingPlayerId: room.game.players[room.game.currentPlayerIndex], timestamp: now() });
    console.log(`[${now()}] Game started in room ${roomId}. first=${room.game.players[room.game.currentPlayerIndex]}`);
    broadcastRoomList();
}

export function requestStartGame(requesterId, payload = {}) {
    const roomId = payload.roomId || userRooms.get(requesterId);
    console.log(`[${now()}] requestStartGame called by ${requesterId} payload=${JSON.stringify(payload)} inferredRoom=${roomId}`);
    if (!roomId || !rooms.has(roomId)) {
        console.log(`[${now()}] requestStartGame: room not found for ${requesterId}`);
        sendToClient(requesterId, { type: "error", message: "Raum nicht gefunden." });
        return;
    }
    const room = rooms.get(roomId);

    if (!room.players.includes(requesterId)) {
        console.log(`[${now()}] requestStartGame: requester ${requesterId} not in room ${roomId}`);
        sendToClient(requesterId, { type: "error", message: "Du bist nicht in diesem Raum." });
        return;
    }

    const ownerId = room.ownerId;
    const startOpts = { options: payload.options || {} };

    if (payload.requestType === "bull" || (payload.options && payload.options.startChoice === "bull")) {
        startOpts.startingMode = "bull";
    }

    if (payload.startingPlayerId) {
        startOpts.startingPlayerId = payload.startingPlayerId;
    } else if (payload.desiredStarter === "me" || payload.desiredStarter === "request_opponent" || payload.desiredStarter === "request_self") {
        startOpts.startingPlayerId = requesterId;
    } else {
        startOpts.startingPlayerId = requesterId;
    }

    console.log(`[${now()}] requestStartGame -> owner=${ownerId} will be asked to start with starter=${startOpts.startingPlayerId}`);

    if (ownerId) {
        sendToClient(ownerId, { type: "debug_start_request_received", requesterId, payload: startOpts, timestamp: now() });
    }
    sendToClient(requesterId, { type: "debug_start_request_sent", toOwner: ownerId, payload: startOpts, timestamp: now() });

    if (ownerId && room.players.includes(ownerId)) {
        console.log(`[${now()}] requestStartGame: starting game ON BEHALF OF owner ${ownerId} with starter ${startOpts.startingPlayerId}`);
        startGame(ownerId, startOpts);
    } else {
        startOpts.startingPlayerId = startOpts.startingPlayerId || requesterId;
        console.log(`[${now()}] requestStartGame: owner missing, starting directly with ${startOpts.startingPlayerId}`);
        const actualPlayers = room.players.filter(p => p);
        room.game = new Game(actualPlayers, Object.assign({}, room.options || {}, startOpts.options, { startingPlayerId: startOpts.startingPlayerId }));
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

// ========================================================================
// HIER IST DIE EINE, ENTSCHEIDENDE KORREKTUR
// ========================================================================
export function handleGameAction(clientId, action) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (!room || !room.game) return;

    // Führe die Aktion in der Game-Logik aus.
    const actionWasValid = room.game.handleAction(clientId, action);

    // Wenn die Aktion gültig war:
    if (actionWasValid) {
        // 1. Hole den neuen Zustand mit DEINER funktionierenden `getFullRoomState` Funktion.
        //    Dadurch bleiben Namen, Cams etc. erhalten.
        const newFullState = getFullRoomState(room);
        
        // 2. Hole die Liste der Spieler direkt aus der Game-Instanz.
        //    Das ist die garantiert korrekte Liste der aktiven Spieler.
        const playersToNotify = room.game.players;

        // 3. Sende den neuen Zustand manuell an JEDEN Spieler.
        console.log(`[FIXED] Aktion von ${clientId} gültig. Sende Update an ${playersToNotify.join(', ')}.`);
        playersToNotify.forEach(id => {
            sendToClient(id, newFullState);
        });
    }
}
// ========================================================================


// For debugging
export function __debugDump() {
    return {
        rooms: Array.from(rooms.entries()).map(([id, r]) => ({ id, ownerId: r.ownerId, players: r.players, playerNames: r.playerNames, hasGame: !!r.game })),
        userRooms: Array.from(userRooms.entries()),
    };
}