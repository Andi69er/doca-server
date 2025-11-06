// server.js - Version mit Checkout-Logik und optimiertem Undo

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

let gameRoom = {
    players: [], gameState: null, gameSettings: null, lastState: null // OPTIMIERT: Nur noch letzter Zustand
};

function createInitialGameState(settings) { /* ... (unverändert) ... */ }

// NEU: Eigene Funktion für die Checkout-Logik
function finishLeg(gameState, score, darts) {
    const playerKey = gameState.currentPlayer;
    const player = gameState[playerKey];
    
    player.score -= score;
    player.lastThrow = score;
    player.totalScore += score;
    player.legDarts += darts;
    player.totalDarts += darts;
    player.legsWon++;
    gameState.legJustFinished = true;

    let target = gameState.settings.targetValue;
    if (gameState.settings.matchMode === 'best-of') { target = Math.floor(target / 2) + 1; }
    if (player.legsWon >= target) {
        gameState.matchJustFinished = true;
        gameState.inProgress = false;
    } else {
        gameState.p1.score = gameState.settings.startScore;
        gameState.p2.score = gameState.settings.startScore;
        gameState.p1.legDarts = 0; gameState.p2.legDarts = 0;
        gameState.legStarter = gameState.legStarter === 'p1' ? 'p2' : 'p1';
        gameState.currentPlayer = gameState.legStarter;
    }
    return gameState;
}

function processScore(gameState, score) { /* ... (bleibt fast gleich, nur ohne Checkout-Teil) ... */ }
function broadcast(data) { /* ... (unverändert) ... */ }

wss.on('connection', ws => {
    // ... (ws.on('connection') bleibt gleich)

    ws.on('message', message => {
        try {
            const data = JSON.parse(message.toString('utf-8'));
            const playerInfo = gameRoom.players.find(p => p.ws === ws);
            if (!playerInfo) return;
            const playerIndex = gameRoom.players.indexOf(playerInfo);
            const sourcePlayerKey = playerInfo.key;

            if (['offer', 'answer', 'candidate'].includes(data.type)) { /* ... unverändert ... */ }

            if (playerIndex === 0) { // Host-Aktionen
                switch(data.type) {
                    case 'start_game':
                        if (gameRoom.gameSettings) {
                            gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
                            gameRoom.lastState = null; // Zurücksetzen bei Spielstart
                            broadcast({ type: 'start_game', gameState: gameRoom.gameState });
                        }
                        break;
                    // ... (restliche Host-Aktionen unverändert) ...
                }
            }
            
            if (data.type === 'submit_score') {
                if (gameRoom.gameState && gameRoom.gameState.currentPlayer === sourcePlayerKey) {
                    gameRoom.lastState = JSON.parse(JSON.stringify(gameRoom.gameState)); // Speichere Zustand VOR dem Wurf
                    gameRoom.gameState = processScore(gameRoom.gameState, data.score);
                    broadcast({ type: 'game_update', gameState: gameRoom.gameState });
                }
            }

            // NEU: Eigener Handler für den Checkout
            if (data.type === 'submit_checkout') {
                if (gameRoom.gameState && gameRoom.gameState.currentPlayer === sourcePlayerKey) {
                    gameRoom.lastState = JSON.parse(JSON.stringify(gameRoom.gameState));
                    gameRoom.gameState = finishLeg(gameRoom.gameState, data.score, data.darts);
                    broadcast({ type: 'game_update', gameState: gameRoom.gameState });
                }
            }
            
            // OPTIMIERT: "Wurf zurück" Logik
            if (data.type === 'undo_throw') {
                if (gameRoom.lastState) {
                    // Der Spieler, der NICHT dran ist, kann zurücknehmen
                    if (gameRoom.gameState.currentPlayer !== sourcePlayerKey) {
                        gameRoom.gameState = gameRoom.lastState;
                        gameRoom.lastState = null; // Man kann nur einmal zurücknehmen
                        broadcast({ type: 'game_update', gameState: gameRoom.gameState });
                    }
                }
            }
        } catch(e) { console.error("Fehler bei Nachrichtenverarbeitung:", e); }
    });

    // ... (ws.on('close') bleibt gleich)
});
// ... (Die kompletten Funktionen füge ich unten ein, damit du alles hast)
// ===================================================================
// KOMPLETTER CODE FÜR server.js
// ===================================================================
function createInitialGameState(settings) { const startScore = parseInt(settings['spiel-typ']) || 501; const initialPlayerState = (name) => ({ name, score: startScore, legDarts: 0, lastThrow: null, totalDarts: 0, totalScore: 0, legsWon: 0, setsWon: 0 }); return { p1: initialPlayerState(settings['name-spieler1']), p2: initialPlayerState(settings['name-spieler2']), currentPlayer: settings.starter || 'p1', legStarter: settings.starter || 'p1', setStarter: settings.starter || 'p1', inProgress: true, settings: { startScore, distanz: settings.distanz, 'check-out': settings['check-out'], targetValue: parseInt(settings.anzahl) || 3, matchMode: settings['match-modus'] } }; }
function processScore(gameState, score) { const playerKey = gameState.currentPlayer; const player = gameState[playerKey]; const newScore = player.score - score; const isBust = newScore < 0 || (newScore === 1 && gameState.settings['check-out'] !== 'Single Out'); player.legDarts += 3; player.totalDarts += 3; gameState.legJustFinished = false; gameState.matchJustFinished = false; if (isBust) { player.lastThrow = `BUST (${score})`; } else { player.score = newScore; player.lastThrow = score; player.totalScore += score; } gameState.currentPlayer = playerKey === 'p1' ? 'p2' : 'p1'; return gameState; }
function broadcast(data) { const message = JSON.stringify(data); gameRoom.players.forEach(player => { if (player.ws.readyState === WebSocket.OPEN) { player.ws.send(message); } }); }
wss.on('connection', ws => {
    if (gameRoom.players.length >= 2) { ws.send(JSON.stringify({ type: 'error', message: 'Das Spiel ist bereits voll.' })); ws.close(); return; }
    const playerIndex = gameRoom.players.length;
    const playerKey = `p${playerIndex + 1}`;
    gameRoom.players.push({ ws, key: playerKey });
    console.log(`Spieler ${playerIndex + 1} verbunden.`);
    ws.send(JSON.stringify({ type: 'welcome', playerIndex }));
    ws.on('message', message => {
        try {
            const data = JSON.parse(message.toString('utf-8'));
            const playerInfo = gameRoom.players.find(p => p.ws === ws);
            if (!playerInfo) return;
            const sourcePlayerKey = playerInfo.key;
            if (['offer', 'answer', 'candidate'].includes(data.type)) { const otherPlayer = gameRoom.players.find(p => p.ws !== ws); if (otherPlayer) otherPlayer.ws.send(JSON.stringify(data)); return; }
            if (playerIndex === 0) {
                switch(data.type) {
                    case 'settings_update': gameRoom.gameSettings = data.settings; const guest = gameRoom.players[1]; if (guest) guest.ws.send(JSON.stringify({ type: 'settings_update', settings: data.settings })); break;
                    case 'start_game': if (gameRoom.gameSettings) { gameRoom.gameState = createInitialGameState(gameRoom.gameSettings); gameRoom.lastState = null; broadcast({ type: 'start_game', gameState: gameRoom.gameState }); } break;
                    case 'new_game': gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.lastState = null; broadcast({ type: 'new_game' }); break;
                }
            }
            if (data.type === 'submit_score') { if (gameRoom.gameState && gameRoom.gameState.currentPlayer === sourcePlayerKey) { gameRoom.lastState = JSON.parse(JSON.stringify(gameRoom.gameState)); gameRoom.gameState = processScore(gameRoom.gameState, data.score); broadcast({ type: 'game_update', gameState: gameRoom.gameState }); } }
            if (data.type === 'submit_checkout') { if (gameRoom.gameState && gameRoom.gameState.currentPlayer === sourcePlayerKey) { gameRoom.lastState = JSON.parse(JSON.stringify(gameRoom.gameState)); gameRoom.gameState = finishLeg(gameRoom.gameState, data.score, data.darts); broadcast({ type: 'game_update', gameState: gameRoom.gameState }); } }
            if (data.type === 'undo_throw') { if (gameRoom.lastState) { if (gameRoom.gameState.currentPlayer !== sourcePlayerKey) { gameRoom.gameState = gameRoom.lastState; gameRoom.lastState = null; broadcast({ type: 'game_update', gameState: gameRoom.gameState }); } } }
        } catch(e) { console.error("Fehler bei Nachrichtenverarbeitung:", e); }
    });
    ws.on('close', () => { console.log(`Spieler ${playerIndex + 1} hat die Verbindung getrennt.`); gameRoom.players = gameRoom.players.filter(p => p.ws !== ws); if (gameRoom.players.length < 2 && gameRoom.gameState) { gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.lastState = null; if (gameRoom.players.length === 1) { gameRoom.players[0].ws.send(JSON.stringify({ type: 'new_game' })); } } });
});
console.log(`Finaler Spiel-Server (Version 10 - Checkout & Undo Fix) gestartet`);