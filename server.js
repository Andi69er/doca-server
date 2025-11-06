// server.js - STABILE VERSION mit Logging

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

let gameRoom = { players: [], gameState: null, gameSettings: null, lastState: null };

function createInitialGameState(settings) {
    const startScore = parseInt(settings['spiel-typ']) || 501;
    const initialPlayerState = (name) => ({ name, score: startScore, legDarts: 0, lastThrow: null, totalDarts: 0, totalScore: 0, legsWon: 0 });
    return {
        p1: initialPlayerState(settings['name-spieler1']),
        p2: initialPlayerState(settings['name-spieler2']),
        currentPlayer: settings.starter || 'p1', legStarter: settings.starter || 'p1', inProgress: true,
        settings: { startScore, targetValue: parseInt(settings.anzahl) || 3, matchMode: settings['match-modus'] }
    };
}

function processScore(gameState, score) {
    const playerKey = gameState.currentPlayer;
    const player = gameState[playerKey];
    const newScore = player.score - score;
    const isBust = newScore < 0 || newScore === 1; // Vereinfacht für Double/Single Out

    player.legDarts += 3; player.totalDarts += 3;
    gameState.legJustFinished = false;

    if (isBust) {
        player.lastThrow = `BUST (${score})`;
    } else {
        player.score = newScore;
        player.lastThrow = score;
        player.totalScore += score;
    }

    if (newScore === 0 && !isBust) {
        player.legsWon++;
        gameState.legJustFinished = true;
        let target = gameState.settings.targetValue;
        if(gameState.settings.matchMode === 'best-of') target = Math.floor(target/2) + 1;
        if (player.legsWon >= target) {
            gameState.inProgress = false; // Match vorbei
        } else {
            gameState.p1.score = gameState.settings.startScore;
            gameState.p2.score = gameState.settings.startScore;
            gameState.p1.legDarts = 0; gameState.p2.legDarts = 0;
            gameState.legStarter = gameState.legStarter === 'p1' ? 'p2' : 'p1';
            gameState.currentPlayer = gameState.legStarter;
        }
    } else {
        gameState.currentPlayer = playerKey === 'p1' ? 'p2' : 'p1';
    }
    return gameState;
}

function broadcast(data) {
    console.log("SERVER: Sende an alle Clients:", data.type);
    const message = JSON.stringify(data);
    gameRoom.players.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(message);
        }
    });
}

wss.on('connection', ws => {
    if (gameRoom.players.length >= 2) {
        console.log("SERVER: Verbindung abgelehnt, Raum ist voll.");
        ws.close();
        return;
    }

    const playerIndex = gameRoom.players.length;
    const playerKey = `p${playerIndex + 1}`;
    gameRoom.players.push({ ws, key: playerKey });
    console.log(`SERVER: Spieler ${playerIndex} (${playerKey}) hat sich verbunden. Spieler insgesamt: ${gameRoom.players.length}`);

    ws.send(JSON.stringify({ type: 'welcome', playerIndex }));

    ws.on('message', message => {
        const data = JSON.parse(message.toString());
        console.log(`SERVER: Nachricht von Spieler ${playerIndex} erhalten:`, data);
        const sourcePlayerKey = `p${playerIndex + 1}`;

        if (['offer', 'answer', 'candidate'].includes(data.type)) {
            const targetPlayer = gameRoom.players.find(p => p.ws !== ws);
            if (targetPlayer && targetPlayer.ws.readyState === WebSocket.OPEN) {
                console.log(`SERVER: Leite WebRTC-Nachricht '${data.type}' an anderen Spieler weiter.`);
                targetPlayer.ws.send(JSON.stringify(data));
            }
            return;
        }
        
        // Nur Spieler 1 darf das Spiel steuern
        if (playerIndex === 0) {
            if (data.type === 'settings_update') {
                console.log("SERVER: Spieler 1 aktualisiert die Einstellungen.");
                gameRoom.gameSettings = data.settings;
                broadcast(data);
            }
            if (data.type === 'start_game') {
                if (gameRoom.gameSettings) {
                    console.log("SERVER: Spieler 1 startet das Spiel. Erstelle Spielzustand...");
                    gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
                    gameRoom.lastState = null;
                    broadcast({ type: 'start_game', gameState: gameRoom.gameState });
                } else {
                    console.error("SERVER-FEHLER: Spieler 1 versuchte, das Spiel zu starten, aber es wurden keine Einstellungen gefunden!");
                    ws.send(JSON.stringify({ type: 'error', message: 'Keine Spieleinstellungen vorhanden. Bitte Seite neu laden.' }));
                }
            }
            if (data.type === 'new_game') {
                console.log("SERVER: Spieler 1 startet ein neues Spiel. Setze alles zurück.");
                gameRoom.gameState = null;
                gameRoom.gameSettings = null;
                gameRoom.lastState = null;
                broadcast({ type: 'new_game' });
            }
        } else {
            // Loggen, wenn Spieler 2 versucht, eine Admin-Aktion auszuführen
            if (['settings_update', 'start_game', 'new_game'].includes(data.type)) {
                console.warn(`SERVER: Spieler ${playerIndex} versuchte eine verbotene Aktion: ${data.type}`);
            }
        }
        
        // Aktionen, die während des Spiels von beiden Spielern kommen können
        if (data.type === 'submit_score' && gameRoom.gameState?.currentPlayer === sourcePlayerKey) {
            console.log(`SERVER: Spieler ${playerIndex} reicht Punktzahl ${data.score} ein.`);
            gameRoom.lastState = JSON.parse(JSON.stringify(gameRoom.gameState));
            gameRoom.gameState = processScore(gameRoom.gameState, data.score);
            broadcast({ type: 'game_update', gameState: gameRoom.gameState });
        }
        if (data.type === 'undo_throw' && gameRoom.lastState && gameRoom.gameState?.currentPlayer !== sourcePlayerKey) {
            console.log(`SERVER: Wurf wird auf Anfrage von Spieler ${playerIndex} zurückgenommen.`);
            gameRoom.gameState = gameRoom.lastState;
            gameRoom.lastState = null;
            broadcast({ type: 'game_update', gameState: gameRoom.gameState });
        }
    });

    ws.on('close', () => {
        console.log(`SERVER: Spieler ${playerIndex} hat die Verbindung getrennt.`);
        gameRoom.players = gameRoom.players.filter(p => p.ws !== ws);
        // Wenn ein Spieler geht, wird das laufende Spiel für alle beendet.
        if (gameRoom.gameState) {
            console.log("SERVER: Ein Spieler hat den Raum verlassen. Das Spiel wird zurückgesetzt.");
            gameRoom.gameState = null;
            gameRoom.gameSettings = null;
            gameRoom.lastState = null;
            broadcast({ type: 'new_game' });
        }
    });
});

console.log(`Stabile Spiel-Server Version 13 (mit Logging) gestartet auf Port ${port}`);