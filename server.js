// server.js - FINALE VERSION

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

let gameRoom = {
    players: [],      // Speichert die WebSocket-Verbindungen
    gameState: null,
    gameSettings: null
};

// ===================================================================
// SPIEL-LOGIK AUF DEM SERVER
// ===================================================================
function createInitialGameState(settings) {
    const startScore = parseInt(settings['spiel-typ']) || 501;
    const initialPlayerState = (name) => ({
        name: name, score: startScore, legDarts: 0, lastThrow: null, totalDarts: 0, totalScore: 0, legsWon: 0, setsWon: 0
    });
    return {
        p1: initialPlayerState(settings['name-spieler1']),
        p2: initialPlayerState(settings['name-spieler2']),
        currentPlayer: 'p1', // Host beginnt immer
        legStarter: 'p1', setStarter: 'p1', inProgress: true,
        settings: {
            startScore: startScore, distanz: settings.distanz,
            'check-out': settings['check-out'],
            targetValue: parseInt(settings.anzahl) || 3,
            matchMode: settings['match-modus']
        }
    };
}

function processScore(gameState, score) {
    const playerKey = gameState.currentPlayer;
    const player = gameState[playerKey];
    const newScore = player.score - score;
    const isBust = newScore < 0 || (newScore === 1 && gameState.settings['check-out'] !== 'Single Out');

    player.legDarts += 3; player.totalDarts += 3;
    gameState.legJustFinished = false; gameState.matchJustFinished = false;

    if (isBust) {
        player.lastThrow = `BUST (${score})`;
        player.score = player.score; // Score bleibt gleich
    } else {
        player.score = newScore;
        player.lastThrow = score;
        player.totalScore += score;
    }

    if (newScore === 0 && !isBust) {
        player.legsWon++;
        gameState.legJustFinished = true;
        if (player.legsWon >= gameState.settings.targetValue) { // Vereinfachte Sieg-Logik
            gameState.matchJustFinished = true;
            gameState.inProgress = false;
        } else {
            // Nächstes Leg vorbereiten
            gameState.p1.score = gameState.settings.startScore;
            gameState.p2.score = gameState.settings.startScore;
            gameState.p1.legDarts = 0; gameState.p2.legDarts = 0;
            gameState.legStarter = gameState.legStarter === 'p1' ? 'p2' : 'p1';
            gameState.currentPlayer = gameState.legStarter;
        }
    } else {
        // Spieler wechseln
        gameState.currentPlayer = playerKey === 'p1' ? 'p2' : 'p1';
    }
    
    return gameState;
}


// ===================================================================
// SERVER-KOMMUNIKATION
// ===================================================================
function broadcast(data) {
    const message = JSON.stringify(data);
    gameRoom.players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    });
}

wss.on('connection', function connection(ws) {
    if (gameRoom.players.length >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Das Spiel ist bereits voll.' }));
        ws.close();
        return;
    }

    const playerIndex = gameRoom.players.push({ ws }) - 1;
    console.log(`Spieler ${playerIndex + 1} verbunden.`);
    ws.send(JSON.stringify({ type: 'welcome', playerIndex: playerIndex }));

    ws.on('message', function incoming(message) {
        const data = JSON.parse(message.toString('utf-8'));
        const sourcePlayerKey = `p${playerIndex + 1}`;

        if (['offer', 'answer', 'candidate'].includes(data.type)) {
            const otherPlayer = gameRoom.players.find(p => p.ws !== ws);
            if (otherPlayer) otherPlayer.ws.send(JSON.stringify(data));
            return;
        }

        if (playerIndex === 0) { // Nur Host (Spieler 1) darf diese Aktionen ausführen
            switch(data.type) {
                case 'settings_update':
                    gameRoom.gameSettings = data.settings;
                    const guest = gameRoom.players[1];
                    if (guest) guest.ws.send(JSON.stringify({ type: 'settings_update', settings: data.settings }));
                    break;
                case 'start_game':
                    if (gameRoom.gameSettings) {
                        gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
                        broadcast({ type: 'start_game', gameState: gameRoom.gameState });
                    }
                    break;
                case 'new_game':
                     gameRoom.gameState = null; gameRoom.gameSettings = null;
                     broadcast({ type: 'new_game' });
                     break;
            }
        }
        
        if (data.type === 'submit_score') {
            if (gameRoom.gameState && gameRoom.gameState.currentPlayer === sourcePlayerKey) {
                gameRoom.gameState = processScore(gameRoom.gameState, data.score);
                broadcast({ type: 'game_update', gameState: gameRoom.gameState });
            }
        }
    });

    ws.on('close', () => {
        console.log(`Spieler ${playerIndex + 1} hat die Verbindung getrennt.`);
        gameRoom.players = gameRoom.players.filter(p => p.ws !== ws);
        if (gameRoom.players.length < 2) {
            gameRoom.gameState = null; gameRoom.gameSettings = null;
            if (gameRoom.players.length === 1) {
                gameRoom.players[0].ws.send(JSON.stringify({ type: 'new_game' }));
            }
        }
    });
});

console.log(`Finaler Spiel-Server (Version 2) gestartet und lauscht auf Port ${port}`);