// server.js - DEBUGGING-VERSION für "Spiel starten"

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

let gameRoom = { players: [], gameState: null, gameSettings: null, history: [] };

function createInitialGameState(settings) { /* ... (unverändert) ... */ }
function processScore(gameState, score) { /* ... (unverändert) ... */ }
function broadcast(data) { const message = JSON.stringify(data); gameRoom.players.forEach(player => { if (player.ws.readyState === WebSocket.OPEN) { player.ws.send(message); } }); }

wss.on('connection', ws => {
    if (gameRoom.players.length >= 2) { ws.send(JSON.stringify({ type: 'error', message: 'Das Spiel ist bereits voll.' })); ws.close(); return; }
    const playerIndex = gameRoom.players.push({ ws }) - 1;
    console.log(`SERVER: Spieler ${playerIndex + 1} verbunden.`);
    ws.send(JSON.stringify({ type: 'welcome', playerIndex }));

    ws.on('message', message => {
        try { // Füge einen try-catch-Block hinzu, um Abstürze zu vermeiden
            const data = JSON.parse(message.toString('utf-8'));
            console.log(`SERVER: Nachricht vom Spieler ${playerIndex + 1} empfangen:`, data);
            const sourcePlayerKey = `p${playerIndex + 1}`;

            if (['offer', 'answer', 'candidate'].includes(data.type)) {
                const otherPlayer = gameRoom.players.find(p => p.ws !== ws);
                if (otherPlayer) {
                    console.log(`SERVER: Leite '${data.type}' von Spieler ${playerIndex + 1} weiter.`);
                    otherPlayer.ws.send(JSON.stringify(data));
                }
                return;
            }

            if (playerIndex === 0) { // Nur Host-Aktionen
                switch (data.type) {
                    case 'settings_update':
                        gameRoom.gameSettings = data.settings;
                        const guest = gameRoom.players[1];
                        if (guest) guest.ws.send(JSON.stringify({ type: 'settings_update', settings: data.settings }));
                        break;
                    case 'start_game':
                        console.log("SERVER: 'start_game' erhalten. Erstelle Spielzustand...");
                        if (gameRoom.gameSettings) {
                            gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
                            gameRoom.history = [];
                            console.log("SERVER: Spielzustand erstellt. Sende an alle Spieler...");
                            broadcast({ type: 'start_game', gameState: gameRoom.gameState });
                        } else {
                            console.error("SERVER: Fehler - 'start_game' empfangen, aber keine gameSettings vorhanden!");
                        }
                        break;
                    case 'new_game':
                        gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.history = [];
                        broadcast({ type: 'new_game' });
                        break;
                }
            }
            
            if (data.type === 'submit_score') { /* ... (unverändert) ... */ }
            if (data.type === 'undo_throw') { /* ... (unverändert) ... */ }

        } catch (e) {
            console.error("SERVER: FEHLER beim Verarbeiten der Nachricht:", e);
        }
    });

    ws.on('close', () => { /* ... (unverändert) ... */ });
});