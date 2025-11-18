// serverdaten/cricketGame.js (NEUE DATEI)
// Eigene Spiel-Logik Klasse nur für Cricket

export default class CricketGame {
    constructor(players, options) {
        this.players = players; // [clientId1, clientId2]
        this.options = options;
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;
        
        // Cricket-spezifischer Zustand
        this.hits = {}; // { clientId: { '20': 1, '19': 3, ... } }
        this.scores = {}; // { clientId: 120 }
        this.closedNumbers = {}; // { clientId: { '20': true, ... } }
        this.throwHistory = {}; // { clientId: ['T20', 'S19', ...] }

        this.players.forEach(pId => {
            if (pId) {
                this.scores[pId] = 0;
                this.hits[pId] = { '20': 0, '19': 0, '18': 0, '17': 0, '16': 0, '15': 0, '25': 0 };
                this.closedNumbers[pId] = {};
                this.throwHistory[pId] = [];
            }
        });
    }

    getState() {
        return {
            isStarted: this.isStarted,
            winner: this.winner,
            players: this.players,
            currentPlayerId: this.players[this.currentPlayerIndex],
            options: this.options,
            throwHistory: this.throwHistory,
            // Cricket-spezifischer Zustand für die UI
            cricketState: {
                hits: this.hits,
                scores: this.scores,
            }
        };
    }

    handleAction(clientId, action) {
        if (this.winner || clientId !== this.players[this.currentPlayerIndex]) {
            return false;
        }

        if (action.type === "player_throw") {
            return this.handleThrow(clientId, action.payload); // payload is { value, multiplier }
        }
        
        // Hier könnte man später eine Undo-Logik für Cricket einbauen
        return false;
    }

    handleThrow(clientId, dart) {
        // dart = { value: 20, multiplier: 3 }
        const { value, multiplier } = dart;
        const validTargets = [20, 19, 18, 17, 16, 15, 25];

        if (!validTargets.includes(value)) return false;

        const opponentId = this.players.find(p => p !== clientId);

        for (let i = 0; i < multiplier; i++) {
            if (this.hits[clientId][value] < 3) {
                this.hits[clientId][value]++;
            } else {
                // Spieler hat das Feld schon zu, jetzt wird gepunktet
                // Bedingung: Der Gegner darf das Feld noch nicht zu haben
                if (!this.closedNumbers[opponentId]?.[value]) {
                    this.scores[clientId] += value;
                }
            }
        }
        
        // Prüfen, ob ein Feld geschlossen wurde
        validTargets.forEach(num => {
            if (this.hits[clientId][num] >= 3) this.closedNumbers[clientId][num] = true;
            if (this.hits[opponentId][num] >= 3) this.closedNumbers[opponentId][num] = true;
        });

        // Wurf zur Historie hinzufügen
        const prefix = {1: 'S', 2: 'D', 3: 'T'}[multiplier] || '';
        const target = value === 25 ? (multiplier === 2 ? 'DB' : 'SB') : value;
        if(value === 25 && multiplier === 1) this.throwHistory[clientId].push('SB');
        else this.throwHistory[clientId].push(prefix + target);


        this.checkWinCondition(clientId);

        // Nach jedem Wurf den Spieler wechseln (vereinfachte Logik für Web-Darts)
        this.nextPlayer();
        return true;
    }

    checkWinCondition(clientId) {
        const opponentId = this.players.find(p => p !== clientId);
        
        const clientHasAllClosed = Object.keys(this.hits[clientId]).every(num => this.hits[clientId][num] >= 3);

        if (clientHasAllClosed && this.scores[clientId] >= this.scores[opponentId]) {
            this.winner = clientId;
        }
    }

    nextPlayer() {
        if (this.winner) return;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
}
// roomManager.js (FINALE, STABILE VERSION 11.0 - Multi-Game-Support)
import { broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js"; // Für x01
import CricketGame from "./cricketGame.js"; // Für Cricket

const rooms = new Map();
const userRooms = new Map(); // clientId -> roomId
const roomDeletionTimers = new Map(); // roomId -> timerId

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.ownerUsername,
        playerCount: r.playerNames.filter(p => p).length,
        maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
        variant: r.options?.variant || 'x01' // WICHTIG: Variante an Lobby senden
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
        maxPlayers: 2, 
        options: { ...options, startingScore: options.distance }, // startingScore für x01 beibehalten
        game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId: roomId, variant: options.variant });
}

export function joinRoom(clientId, username, roomId) {
    if (!username) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (roomDeletionTimers.has(roomId)) {
        clearTimeout(roomDeletionTimers.get(roomId));
        roomDeletionTimers.delete(roomId);
    }

    const playerIndex = room.playerNames.indexOf(username);
    if (playerIndex !== -1) {
        room.players[playerIndex] = clientId;
        if(room.ownerUsername === username) room.ownerId = clientId;
        userRooms.set(clientId, roomId);
    } else {
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
        
        if (room.players.every(p => p === null)) {
            const timer = setTimeout(() => {
                if (room.players.every(p => p === null)) {
                    rooms.delete(roomId);
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

export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room && room.ownerId === clientId && room.players.filter(p=>p).length > 1) {
        
        // Hier wird entschieden, welche Spiellogik geladen wird
        if (room.options.variant === 'cricket') {
            room.game = new CricketGame(room.players.filter(p => p), room.options);
        } else {
            room.game = new Game(room.players.filter(p => p), room.options); // Standard ist x01
        }

        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}

export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}