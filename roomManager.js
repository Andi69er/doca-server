// Dateiname: roomManager.js
// FINALE VERSION 3.0 - Radikal vereinfachte und direkte Broadcast-Logik

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
    // WICHTIG: Füge die Spielernamen hinzu, da die Game-Klasse sie nicht kennt
    const playerNames = {};
    room.players.forEach((id, index) => {
        if (id) {
            playerNames[id] = room.playerNames[index];
        }
    });

    return {
        type: "game_state",
        id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players,
        playerNames: room.playerNames, // Client erwartet dieses Array
        maxPlayers: r.maxPlayers,
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
    broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
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
            broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
        }
        broadcastRoomList();
    }
}

export function startGame(ownerId, opts = {}) {
    const roomId = userRooms.get(ownerId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.ownerId !== ownerId) return;

    const actualPlayers = room.players.filter(p => p);
    if (actualPlayers.length < 2) return;

    const gameOptions = Object.assign({}, room.options || {}, opts.options || {});
    if (opts.startingMode) gameOptions.startingMode = opts.startingMode;
    if (opts.startingPlayerId) gameOptions.startingPlayerId = opts.startingPlayerId;

    room.game = new Game(actualPlayers, gameOptions);
    
    broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
    console.log(`[${now()}] Game started in room ${roomId}. first=${room.game.players[room.game.currentPlayerIndex]}`);
    broadcastRoomList();
}

export function requestStartGame(requesterId, payload = {}) {
    const roomId = payload.roomId || userRooms.get(requesterId);
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (!room.players.includes(requesterId)) return;

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

    if (ownerId && room.players.includes(ownerId)) {
        startGame(ownerId, startOpts);
    } else {
        const actualPlayers = room.players.filter(p => p);
        room.game = new Game(actualPlayers, Object.assign({}, room.options || {}, startOpts.options, { startingPlayerId: startOpts.startingPlayerId }));
        broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
        broadcastRoomList();
    }
}

// ========================================================================
// HIER IST DIE FINALE, KUGELSICHERE VERSION DER FUNKTION
// ========================================================================
export function handleGameAction(clientId, action) {
    const roomId = userRooms.get(clientId);
    if (!roomId) {
        console.error(`[${now()}] FEHLER: Client ${clientId} hat eine Aktion gesendet, ist aber in keinem Raum.`);
        return;
    }
    
    const room = rooms.get(roomId);
    if (!room || !room.game) {
        console.error(`[${now()}] FEHLER: Aktion von ${clientId} in Raum ${roomId} empfangen, aber es läuft kein Spiel.`);
        return;
    }

    // Schritt 1: Führe die Aktion in der Game-Logik aus.
    const actionWasValid = room.game.handleAction(clientId, action);

    // Schritt 2: Wenn die Aktion gültig war (Wurf vom richtigen Spieler etc.)...
    if (actionWasValid) {
        // ... DANN sende den neuen Zustand an ALLE Spieler im Spiel.

        // Hole den neuen, kompletten Spiel-Zustand.
        const newGameStatePayload = getFullRoomState(room);
        
        // Hole die Liste der Spieler, die im Spiel sind, direkt aus der Game-Instanz.
        // Das ist die GARANTIERT korrekte Liste.
        const playersInGame = room.game.players;

        // Zusätzliches Logging, damit du siehst, was passiert
        console.log(`[${now()}] Aktion von ${clientId} war gültig. Sende neuen Spielzustand an: ${playersInGame.join(', ')}`);
        console.log(`[${now()}] Neuer currentPlayerId: ${newGameStatePayload.currentPlayerId}`);

        // Sende die Nachricht manuell an jeden einzelnen Spieler.
        playersInGame.forEach(player_id => {
            sendToClient(player_id, newGameStatePayload);
        });
    } else {
        // Zusätzliches Logging für den Fehlerfall
        console.log(`[${now()}] Aktion von ${clientId} war UNGÜLTIG. (Wahrscheinlich nicht am Zug). Kein Update gesendet.`);
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