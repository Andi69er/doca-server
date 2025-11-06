// server.js - DEBUGGING-VERSION für "Spiel starten"

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

let gameRoom = { players: [], gameState: null, gameSettings: null, history: [] };

// ... (Die create/process/broadcast Funktionen bleiben unverändert, hier der Vollständigkeit halber)
function createInitialGameState(settings) { const startScore = parseInt(settings['spiel-typ']) || 501; const initialPlayerState = (name) => ({ name, score: startScore, legDarts: 0, lastThrow: null, totalDarts: 0, totalScore: 0, legsWon: 0, setsWon: 0 }); return { p1: initialPlayerState(settings['name-spieler1']), p2: initialPlayerState(settings['name-spieler2']), currentPlayer: settings.starter || 'p1', legStarter: settings.starter || 'p1', setStarter: settings.starter || 'p1', inProgress: true, settings: { startScore, distanz: settings.distanz, 'check-out': settings['check-out'], targetValue: parseInt(settings.anzahl) || 3, matchMode: settings['match-modus'] } }; }
function processScore(gameState, score) { const playerKey = gameState.currentPlayer; const player = gameState[playerKey]; const newScore = player.score - score; const isBust = newScore < 0 || (newScore === 1 && gameState.settings['check-out'] !== 'Single Out'); player.legDarts += 3; player.totalDarts += 3; gameState.legJustFinished = false; gameState.matchJustFinished = false; if (isBust) { player.lastThrow = `BUST (${score})`; } else { player.score = newScore; player.lastThrow = score; player.totalScore += score; } if (newScore === 0 && !isBust) { player.legsWon++; gameState.legJustFinished = true; let target = gameState.settings.targetValue; if (gameState.settings.matchMode === 'best-of') { target = Math.floor(target / 2) + 1; } if (player.legsWon >= target) { gameState.matchJustFinished = true; gameState.inProgress = false; } else { gameState.p1.score = gameState.settings.startScore; gameState.p2.score = gameState.settings.startScore; gameState.p1.legDarts = 0; gameState.p2.legDarts = 0; gameState.legStarter = gameState.legStarter === 'p1' ? 'p2' : 'p1'; gameState.currentPlayer = gameState.legStarter; } } else { gameState.currentPlayer = playerKey === 'p1' ? 'p2' : 'p1'; } return gameState; }
function broadcast(data) { const message = JSON.stringify(data); gameRoom.players.forEach(player => { if (player.ws.readyState === WebSocket.OPEN) { player.ws.send(message); } }); }

wss.on('connection', ws => {
    if (gameRoom.players.length >= 2) { ws.send(JSON.stringify({ type: 'error', message: 'Das Spiel ist bereits voll.' })); ws.close(); return; }
    const playerIndex = gameRoom.players.length;
    const playerKey = `p${playerIndex + 1}`;
    gameRoom.players.push({ ws, key: playerKey });
    console.log(`SERVER DEBUG: Spieler ${playerIndex + 1} (${playerKey}) verbunden. Spieler insgesamt: ${gameRoom.players.length}`);
    ws.send(JSON.stringify({ type: 'welcome', playerIndex }));

    ws.on('message', message => {
        try {
            const data = JSON.parse(message.toString('utf-8'));
            console.log(`SERVER DEBUG: Nachricht von Spieler ${playerIndex + 1} empfangen:`, data);

            const sourcePlayerKey = `p${playerIndex + 1}`;

            if (['offer', 'answer', 'candidate'].includes(data.type)) {
                const otherPlayer = gameRoom.players.find(p => p.ws !== ws);
                if (otherPlayer) otherPlayer.ws.send(JSON.stringify(data));
                return;
            }

            if (playerIndex === 0) { // Host-Aktionen
                switch (data.type) {
                    case 'settings_update':
                        gameRoom.gameSettings = data.settings;
                        const guest = gameRoom.players[1];
                        if (guest) guest.ws.send(JSON.stringify({ type: 'settings_update', settings: data.settings }));
                        break;
                    case 'start_game':
                        console.log("SERVER DEBUG: 'start_game' erhalten. Prüfe gameSettings:", gameRoom.gameSettings);
                        if (gameRoom.gameSettings && gameRoom.players.length === 2) {
                            gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
                            gameRoom.history = [];
                            console.log("SERVER DEBUG: Spielzustand erstellt. Sende an alle Clients.");
                            broadcast({ type: 'start_game', gameState: gameRoom.gameState });
                        } else {
                            console.error(`SERVER DEBUG: Fehler - 'start_game' konnte nicht ausgeführt werden. Spieler: ${gameRoom.players.length}, Settings vorhanden: ${!!gameRoom.gameSettings}`);
                        }
                        break;
                    case 'new_game':
                        gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.history = [];
                        broadcast({ type: 'new_game' });
                        break;
                }
            }
            
            if (data.type === 'submit_score') { if (gameRoom.gameState && gameRoom.gameState.currentPlayer === sourcePlayerKey) { gameRoom.history.push(JSON.parse(JSON.stringify(gameRoom.gameState))); gameRoom.gameState = processScore(gameRoom.gameState, data.score); broadcast({ type: 'game_update', gameState: gameRoom.gameState }); } }
            if (data.type === 'undo_throw') { if (gameRoom.gameState && gameRoom.history.length > 0) { if (gameRoom.gameState.currentPlayer !== sourcePlayerKey) { gameRoom.gameState = gameRoom.history.pop(); broadcast({ type: 'game_update', gameState: gameRoom.gameState }); } } }

        } catch (e) { console.error("SERVER DEBUG: FEHLER bei Nachrichtenverarbeitung:", e); }
    });

    ws.on('close', () => {
        console.log(`SERVER DEBUG: Verbindung von Spieler ${playerIndex + 1} wird geschlossen.`);
        gameRoom.players = gameRoom.players.filter(p => p.ws !== ws);
        if (gameRoom.players.length < 2 && gameRoom.gameState) {
            console.log("SERVER DEBUG: Spiel lief und wird zurückgesetzt.");
            gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.history = [];
            if (gameRoom.players.length === 1) { gameRoom.players[0].ws.send(JSON.stringify({ type: 'new_game' })); }
        }
        console.log(`SERVER DEBUG: Aufräumen beendet. Aktive Spieler: ${gameRoom.players.length}`);
    });
});

console.log(`Finaler Spiel-Server (Version 8 - Super-Debug) gestartet`);