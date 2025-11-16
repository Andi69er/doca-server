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

/**
 * startGame
 * @param {string} clientId - the client who issued the start (usually owner)
 * @param {object} [opts] - optional object: { startingPlayerId: <clientId>, startingMode: 'bull', options: {...} }
 *
 * Behavior:
 * - If caller is owner and players > 1: create Game
 * - If opts.startingPlayerId provided, Game will set that player as current if present in player list
 */
export function startGame(clientId, opts = {}) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (!room) return;

    // Only owner can officially start the game from UI (server-level safeguard)
    if (room.ownerId !== clientId) {
        console.log(`startGame denied: ${clientId} is not owner of room ${room.id}`);
        return;
    }

    const actualPlayers = room.players.filter(p => p); // only truthy clientIds
    if (actualPlayers.length < 2) {
        console.log(`startGame aborted: Not enough players in room ${room.id}`);
        return;
    }

    // Merge options: room.options (defaults) overwritten by provided opts.options
    const gameOptions = Object.assign({}, room.options || {}, opts.options || {});
    if (opts.startingMode) gameOptions.startingMode = opts.startingMode;
    if (opts.startingPlayerId) gameOptions.startingPlayerId = opts.startingPlayerId;

    // Create Game with explicit players and options (Game will pick starting player if provided)
    room.game = new Game(actualPlayers, gameOptions);

    console.log(`Game started in room ${room.id} by owner ${clientId}. startingPlayerId: ${gameOptions.startingPlayerId || '(owner default)'}`);
    broadcastToPlayers(room.players, getFullRoomState(room));
    broadcastRoomList();
}

/**
 * requestStartGame
 * Called when a non-owner clicks "Start" and wants the owner to start the game
 * We handle it server-side by instructing the owner to start the game with the requester as starter.
 *
 * @param {string} requesterId - clientId that requested the start (non-owner)
 * @param {object} payload - may contain: { roomId, desiredStarter, requestType, options }
 *
 * Behavior:
 * - Validate requester is in room
 * - If owner present, call startGame(ownerId, { startingPlayerId: requesterId, options })
 * - If owner not present, reject or fallback to ownerless start (here we fallback to direct start)
 */
export function requestStartGame(requesterId, payload = {}) {
    const roomId = payload.roomId || userRooms.get(requesterId);
    if (!roomId || !rooms.has(roomId)) {
        console.log(`requestStartGame: room not found for requester ${requesterId}`);
        sendToClient(requesterId, { type: "error", message: "Raum nicht gefunden." });
        return;
    }
    const room = rooms.get(roomId);

    // sanity: requester must be in room players list
    if (!room.players.includes(requesterId)) {
        console.log(`requestStartGame: requester ${requesterId} not in room ${roomId}`);
        sendToClient(requesterId, { type: "error", message: "Du bist nicht in diesem Raum." });
        return;
    }

    const ownerId = room.ownerId;
    // Build options object to pass to startGame
    const startOpts = { options: payload.options || {} };

    // Special-case: bull/start mode
    if (payload.requestType === "bull" || (payload.options && payload.options.startChoice === "bull")) {
        startOpts.startingMode = "bull";
    }

    // If requester explicitly wants to be starter, set startingPlayerId
    if (payload.desiredStarter === "me" || payload.desiredStarter === "request_opponent" || payload.desiredStarter === "request_self") {
        startOpts.startingPlayerId = requesterId;
    }

    console.log(`requestStartGame: requester=${requesterId} room=${roomId} -> asking owner ${ownerId} to start with starter=${startOpts.startingPlayerId || '(owner default)'} `);

    if (ownerId && rooms && room.players.includes(ownerId)) {
        // If owner is present, instruct owner to start (simulate as if owner called startGame)
        // We could instead send an explicit signal to owner client, but for reliability we directly start here
        // on behalf of owner to ensure deterministic behavior.
        startGame(ownerId, startOpts);
        // Also notify owner and requester that start was triggered
        sendToClient(ownerId, { type: "info", message: `Start-Anfrage von ${requesterId} empfangen. Spiel gestartet.` });
        sendToClient(requesterId, { type: "info", message: `Start-Anfrage verarbeitet. Du startest.` });
    } else {
        // No owner present (rare) -> start directly using requester as starter
        startOpts.startingPlayerId = startOpts.startingPlayerId || requesterId;
        room.game = new Game(room.players.filter(p=>p), Object.assign({}, room.options || {}, startOpts.options, { startingPlayerId: startOpts.startingPlayerId }));
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}
