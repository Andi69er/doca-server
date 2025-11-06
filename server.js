// server.js - STABILE VERSION (mit 3-Dart-Ausbullen)

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

let gameRoom = { players: [], gameState: null, gameSettings: null, lastState: null, bullOffState: null };

function createInitialGameState(settings) {
    const startScore = parseInt(settings['spiel-typ']) || 501;
    const starter = settings.starter;
    const initialPlayerState = (name) => ({ name, score: startScore, legDarts: 0, lastThrow: null, totalDarts: 0, totalScore: 0, legsWon: 0 });
    return {
        p1: initialPlayerState(settings['name-spieler1']),
        p2: initialPlayerState(settings['name-spieler2']),
        currentPlayer: starter, legStarter: starter, inProgress: true,
        settings: { startScore, targetValue: parseInt(settings.anzahl) || 3, matchMode: settings['match-modus'] }
    };
}

function processScore(gameState, score) {
    const playerKey = gameState.currentPlayer;
    const player = gameState[playerKey];
    const newScore = player.score - score;
    const isBust = newScore < 0 || newScore === 1;

    player.legDarts += 3; player.totalDarts += 3;
    gameState.legJustFinished = false;

    if (isBust) { player.lastThrow = `BUST (${score})`; }
    else { player.score = newScore; player.lastThrow = score; player.totalScore += score; }

    if (newScore === 0 && !isBust) {
        player.legsWon++;
        gameState.legJustFinished = true;
        let target = gameState.settings.targetValue;
        if(gameState.settings.matchMode === 'best-of') target = Math.floor(target/2) + 1;
        if (player.legsWon >= target) { gameState.inProgress = false; }
        else {
            gameState.p1.score = gameState.settings.startScore;
            gameState.p2.score = gameState.settings.startScore;
            gameState.p1.legDarts = 0; gameState.p2.legDarts = 0;
            gameState.legStarter = gameState.legStarter === 'p1' ? 'p2' : 'p1';
            gameState.currentPlayer = gameState.legStarter;
        }
    } else { gameState.currentPlayer = playerKey === 'p1' ? 'p2' : 'p1'; }
    return gameState;
}

function determineBullOffWinner() {
    const p1Score = gameRoom.bullOffState.p1;
    const p2Score = gameRoom.bullOffState.p2;

    if (p1Score === null || p2Score === null) return; // Warten, bis beide geworfen haben

    // NEUE REGEL: Beide haben nichts getroffen -> Wiederholung
    if (p1Score === 0 && p2Score === 0) {
        gameRoom.bullOffState = { p1: null, p2: null };
        broadcast({ type: 'bull_off_tie', message: 'Keine Treffer! Bitte erneut werfen.' });
        return;
    }

    if (p1Score > p2Score) {
        gameRoom.gameSettings.starter = 'p1';
        startGameFromBullOff();
    } else if (p2Score > p1Score) {
        gameRoom.gameSettings.starter = 'p2';
        startGameFromBullOff();
    } else {
        // Unentschieden bei 25 oder 50 -> Wiederholung
        gameRoom.bullOffState = { p1: null, p2: null };
        broadcast({ type: 'bull_off_tie', message: 'Gleiches Ergebnis! Bitte erneut werfen.' });
    }
}

function startGameFromBullOff() {
    const winnerName = gameRoom.gameSettings.starter === 'p1' ? gameRoom.gameSettings['name-spieler1'] : gameRoom.gameSettings['name-spieler2'];
    broadcast({ type: 'bull_off_update', message: `${winnerName} hat das Ausbullen gewonnen!` });
    
    setTimeout(() => {
        gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
        gameRoom.lastState = null;
        gameRoom.bullOffState = null;
        broadcast({ type: 'start_game', gameState: gameRoom.gameState });
    }, 2500);
}

function broadcast(data) { const message = JSON.stringify(data); gameRoom.players.forEach(p => { if (p.ws.readyState === WebSocket.OPEN) p.ws.send(message); }); }

wss.on('connection', ws => {
    if (gameRoom.players.length >= 2) { ws.close(); return; }
    const playerIndex = gameRoom.players.length;
    const playerKey = `p${playerIndex + 1}`;
    gameRoom.players.push({ ws, key: playerKey });
    ws.send(JSON.stringify({ type: 'welcome', playerIndex }));

    ws.on('message', message => {
        const data = JSON.parse(message.toString());
        const sourcePlayerKey = `p${playerIndex + 1}`;
        if (['offer', 'answer', 'candidate'].includes(data.type)) { gameRoom.players.find(p => p.ws !== ws)?.ws.send(JSON.stringify(data)); return; }

        if (playerIndex === 0) {
            if (data.type === 'settings_update') { gameRoom.gameSettings = data.settings; broadcast(data); }
            if (data.type === 'start_game' && data.settings) {
                gameRoom.gameSettings = data.settings;
                if (gameRoom.gameSettings.starter === 'bull') {
                    gameRoom.bullOffState = { p1: null, p2: null };
                    broadcast({ type: 'bull_off_start' });
                } else {
                    gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
                    broadcast({ type: 'start_game', gameState: gameRoom.gameState });
                }
            }
            if (data.type === 'new_game') { gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.lastState = null; gameRoom.bullOffState = null; broadcast({ type: 'new_game' }); }
        }

        if (data.type === 'submit_bull_throw' && gameRoom.bullOffState) {
            gameRoom.bullOffState[sourcePlayerKey] = data.bestScore;
            const otherPlayerHasThrown = sourcePlayerKey === 'p1' ? gameRoom.bullOffState.p2 !== null : gameRoom.bullOffState.p1 !== null;
            if (otherPlayerHasThrown) {
                broadcast({ type: 'bull_off_update', message: 'Ergebnis wird ermittelt...' });
            }
            determineBullOffWinner();
        }

        if (data.type === 'submit_score' && gameRoom.gameState?.currentPlayer === sourcePlayerKey) { gameRoom.lastState = JSON.parse(JSON.stringify(gameRoom.gameState)); gameRoom.gameState = processScore(gameRoom.gameState, data.score); broadcast({ type: 'game_update', gameState: gameRoom.gameState }); }
        if (data.type === 'undo_throw' && gameRoom.lastState && gameRoom.gameState?.currentPlayer !== sourcePlayerKey) { gameRoom.gameState = gameRoom.lastState; gameRoom.lastState = null; broadcast({ type: 'game_update', gameState: gameRoom.gameState }); }
    });

    ws.on('close', () => {
        gameRoom.players = gameRoom.players.filter(p => p.ws !== ws);
        if (gameRoom.players.length < 2) {
            gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.lastState = null; gameRoom.bullOffState = null;
            if (gameRoom.players.length > 0) broadcast({ type: 'new_game' });
        }
    });
});

console.log(`Stabile Spiel-Server Version 18 (mit 3-Dart-Ausbullen) gestartet auf Port ${port}`);