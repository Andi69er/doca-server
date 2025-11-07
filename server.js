// server.js - FINALE STABILE VERSION (mit Statistik, Webcam & Spielstart repariert)

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

let gameRoom = { players: [], gameState: null, gameSettings: null, lastState: null, bullOffState: null };

function createInitialGameState(settings) {
    const startScore = parseInt(settings['spiel-typ']) || 501;
    const starter = settings.starter;
    const initialPlayerState = (name) => ({ 
        name, score: startScore, legDarts: 0, lastThrow: null, legsWon: 0,
        highestFinish: 0,
        stats: {
            matchDarts: 0, matchScore: 0, matchAvg: "0.00",
            first9Darts: 0, first9Score: 0, first9Avg: "0.00",
            s0_19: 0, s20_39: 0, s40_59: 0, s60_79: 0, s80_99: 0,
            s100: 0, s140: 0, s171: 0, s180: 0
        }
    });
    return {
        p1: initialPlayerState(settings['name-spieler1']),
        p2: initialPlayerState(settings['name-spieler2']),
        currentPlayer: starter, legStarter: starter, inProgress: true,
        settings: { startScore, targetValue: parseInt(settings.anzahl) || 3, matchMode: settings['match-modus'], checkout: settings['check-out'] }
    };
}

function updateStats(player, score) {
    player.stats.matchDarts += 3;
    player.stats.matchScore += score;
    player.stats.matchAvg = ((player.stats.matchScore) / player.stats.matchDarts * 3).toFixed(2);
    
    if (player.legDarts < 9) {
        const dartsInLeg = Math.min(3, 9 - player.legDarts);
        player.stats.first9Darts += dartsInLeg;
        player.stats.first9Score += score;
        if(player.stats.first9Darts > 0) player.stats.first9Avg = ((player.stats.first9Score) / player.stats.first9Darts * 3).toFixed(2);
    }

    if (score >= 180) player.stats.s180++; else if (score >= 171) player.stats.s171++;
    else if (score >= 140) player.stats.s140++; else if (score >= 100) player.stats.s100++;
    else if (score >= 80) player.stats.s80_99++; else if (score >= 60) player.stats.s60_79++;
    else if (score >= 40) player.stats.s40_59++; else if (score >= 20) player.stats.s20_39++;
    else player.stats.s0_19++;
}

function processScore(gameState, score) {
    const playerKey = gameState.currentPlayer;
    const player = gameState[playerKey];
    const newScore = player.score - score;
    const isBust = newScore < 0 || (newScore === 1 && gameState.settings.checkout.startsWith("Double"));

    updateStats(player, isBust ? 0 : score);
    player.legDarts += 3;
    gameState.legJustFinished = false;

    if (isBust) { player.lastThrow = `BUST (${score})`; } 
    else { player.score = newScore; player.lastThrow = score; }

    if (newScore === 0) {
        player.legsWon++;
        gameState.legJustFinished = true;
        if (score > player.highestFinish) { player.highestFinish = score; }
        
        let target = gameState.settings.targetValue;
        if(gameState.settings.matchMode === 'best-of') target = Math.ceil(target / 2);
        
        if (player.legsWon >= target) {
            gameState.inProgress = false;
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

function determineBullOffWinner() {
    const p1_throws = gameRoom.bullOffState.p1_throws; const p2_throws = gameRoom.bullOffState.p2_throws;
    if (!p1_throws || !p2_throws) return;
    let winner = null;
    for (let i = 0; i < 3; i++) {
        if (p1_throws[i] > p2_throws[i]) { winner = 'p1'; break; }
        if (p2_throws[i] > p1_throws[i]) { winner = 'p2'; break; }
    }
    if (winner) { gameRoom.gameSettings.starter = winner; startGameFromBullOff(); } 
    else {
        const totalScore = p1_throws.reduce((a, b) => a + b, 0);
        const message = totalScore === 0 ? 'Keine Treffer! Bitte erneut werfen.' : 'Gleiches Ergebnis! Bitte erneut werfen.';
        gameRoom.bullOffState = { p1_throws: null, p2_throws: null };
        broadcast({ type: 'bull_off_tie', message: message });
    }
}

function startGameFromBullOff() {
    const winnerName = gameRoom.gameSettings.starter === 'p1' ? gameRoom.gameSettings['name-spieler1'] : gameRoom.gameSettings['name-spieler2'];
    broadcast({ type: 'bull_off_update', message: `${winnerName} hat das Ausbullen gewonnen!` });
    setTimeout(() => { gameRoom.gameState = createInitialGameState(gameRoom.gameSettings); gameRoom.lastState = null; gameRoom.bullOffState = null; broadcast({ type: 'start_game', gameState: gameRoom.gameState }); }, 2500);
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
                    gameRoom.bullOffState = { p1_throws: null, p2_throws: null };
                    broadcast({ type: 'bull_off_start' });
                } else {
                    gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
                    broadcast({ type: 'start_game', gameState: gameRoom.gameState });
                }
            }
            if (data.type === 'new_game') { gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.lastState = null; gameRoom.bullOffState = null; broadcast({ type: 'new_game' }); }
        }

        if (data.type === 'submit_bull_throw' && gameRoom.bullOffState) {
            gameRoom.bullOffState[`${sourcePlayerKey}_throws`] = data.throws;
            const otherPlayerHasThrown = sourcePlayerKey === 'p1' ? !!gameRoom.bullOffState.p2_throws : !!gameRoom.bullOffState.p1_throws;
            if (otherPlayerHasThrown) { broadcast({ type: 'bull_off_update', message: 'Ergebnis wird ermittelt...' }); }
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

console.log(`Finale stabile Server-Version 21 (mit Statistik) gestartet auf Port ${port}`);