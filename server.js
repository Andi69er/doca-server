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
    const initialPlayerState = (name) => ({
        name: name, score: parseInt(settings['spiel-typ']), legDarts: 0, lastThrow: null, totalDarts: 0, totalScore: 0, legsWon: 0, setsWon: 0
    });
    return {
        p1: initialPlayerState(settings['name-spieler1']),
        p2: initialPlayerState(settings['name-spieler2']),
        currentPlayer: 'p1', // Host beginnt immer
        legStarter: 'p1',
        setStarter: 'p1',
        inProgress: true,
        settings: { // Nur die relevanten Einstellungen für die UI
            startScore: parseInt(settings['spiel-typ']),
            distanz: settings.distanz,
            matchModus: settings['match-modus'],
            anzahl: parseInt(settings.anzahl)
        }
    };
}

function processScore(gameState, score) {
    const playerKey = gameState.currentPlayer;
    const player = gameState[playerKey];
    const newScore = player.score - score;
    const isBust = newScore < 0 || (newScore === 1 && gameState.settings['check-out'] !== 'Single Out');

    player.legDarts += 3;
    player.totalDarts += 3;

    if (isBust) {
        player.lastThrow = `BUST (${score})`;
    } else {
        player.score = newScore;
        player.lastThrow = score;
        player.totalScore += score;
    }

    // Sieg-Logik (vereinfacht für den Anfang)
    if (newScore === 0 && !isBust) {
        player.legsWon++;
        gameState.legJustFinished = true; // Flag für Sound-Effekte
        // ... (komplette Leg/Set/Match-Logik kommt hier später)
    } else {
        gameState.legJustFinished = false;
    }
    
    // Spieler wechseln
    gameState.currentPlayer = playerKey === 'p1' ? 'p2' : 'p1';
    
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
    const playerKey = `p${playerIndex + 1}`;
    console.log(`Spieler ${playerIndex + 1} verbunden.`);
    ws.send(JSON.stringify({ type: 'welcome', playerIndex: playerIndex }));

    ws.on('message', function incoming(message) {
        const data = JSON.parse(message.toString('utf-8'));
        const sourcePlayer = gameRoom.players.find(p => p.ws === ws);

        // WebRTC-Nachrichten direkt an den anderen Spieler weiterleiten
        if (['offer', 'answer', 'candidate'].includes(data.type)) {
            const otherPlayer = gameRoom.players.find(p => p.ws !== ws);
            if (otherPlayer && otherPlayer.ws.readyState === WebSocket.OPEN) {
                otherPlayer.ws.send(JSON.stringify(data));
            }
            return;
        }

        // Spiel-Logik (darf nur vom Host/Spieler 1 gesteuert werden)
        if (playerIndex === 0) { // Nur Host darf das Spiel steuern
            switch(data.type) {
                case 'settings_update':
                    gameRoom.gameSettings = data.settings;
                    // An den Gast weiterleiten
                    const guest = gameRoom.players[1];
                    if (guest && guest.ws.readyState === WebSocket.OPEN) {
                        guest.ws.send(JSON.stringify({ type: 'settings_update', settings: data.settings }));
                    }
                    break;
                
                case 'start_game':
                    if (gameRoom.gameSettings) {
                        gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
                        broadcast({ type: 'start_game', gameState: gameRoom.gameState });
                    }
                    break;
                
                case 'new_game':
                     gameRoom.gameState = null;
                     gameRoom.gameSettings = null;
                     broadcast({ type: 'new_game' });
                     break;
            }
        }
        
        // Score-Eingabe (darf nur der aktive Spieler)
        if (data.type === 'submit_score') {
            if (gameRoom.gameState && gameRoom.gameState.currentPlayer === playerKey) {
                gameRoom.gameState = processScore(gameRoom.gameState, data.score);
                broadcast({ type: 'game_update', gameState: gameRoom.gameState });
            }
        }
    });

    ws.on('close', () => {
        console.log(`Spieler ${playerIndex + 1} hat die Verbindung getrennt.`);
        gameRoom.players = gameRoom.players.filter(p => p.ws !== ws);
        // Spiel zurücksetzen, wenn ein Spieler geht
        if (gameRoom.players.length < 2) {
            gameRoom.gameState = null;
            gameRoom.gameSettings = null;
            // Informiere den verbleibenden Spieler
            if (gameRoom.players.length === 1) {
                gameRoom.players[0].ws.send(JSON.stringify({ type: 'new_game' }));
            }
        }
    });
});

console.log(`Finaler Spiel-Server gestartet und lauscht auf Port ${port}`);