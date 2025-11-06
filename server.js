// server.js - Version mit Match-Statistik & allen Bugfixes

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

let gameRoom = { players: [], gameState: null, gameSettings: null, lastState: null };

function createInitialGameState(settings) {
    const startScore = parseInt(settings['spiel-typ']) || 501;
    const initialPlayerState = (name) => ({ 
        name, score: startScore, legDarts: 0, lastThrow: null, totalDarts: 0, totalScore: 0, legsWon: 0, setsWon: 0,
        allThrows: [], checkoutAttempts: 0, checkoutHits: 0, highestFinish: 0
    });
    return {
        p1: initialPlayerState(settings['name-spieler1']),
        p2: initialPlayerState(settings['name-spieler2']),
        currentPlayer: settings.starter || 'p1', legStarter: settings.starter || 'p1', setStarter: settings.starter || 'p1', inProgress: true,
        settings: { startScore, distanz: settings.distanz, 'check-out': settings['check-out'], targetValue: parseInt(settings.anzahl) || 3, matchMode: settings['match-modus'] }
    };
}

function finishLeg(gameState, score, darts) {
    const playerKey = gameState.currentPlayer;
    const player = gameState[playerKey];
    player.score -= score; player.lastThrow = score; player.totalScore += score;
    player.legDarts += darts; player.totalDarts += darts; player.legsWon++;
    player.allThrows.push(score);
    if(gameState.settings['check-out'] !== 'Single Out') player.checkoutHits++;
    if(score > player.highestFinish) player.highestFinish = score;
    
    gameState.legJustFinished = true;
    let target = gameState.settings.targetValue;
    if (gameState.settings.matchMode === 'best-of') { target = Math.floor(target / 2) + 1; }
    if (player.legsWon >= target) {
        gameState.matchJustFinished = true;
        gameState.inProgress = false;
    } else {
        gameState.p1.score = gameState.settings.startScore; gameState.p2.score = gameState.settings.startScore;
        gameState.p1.legDarts = 0; gameState.p2.legDarts = 0;
        gameState.legStarter = gameState.legStarter === 'p1' ? 'p2' : 'p1';
        gameState.currentPlayer = gameState.legStarter;
    }
    return gameState;
}

function processScore(gameState, score) {
    const playerKey = gameState.currentPlayer;
    const player = gameState[playerKey];
    const scoreBefore = player.score;
    const newScore = player.score - score;
    const isBust = newScore < 0 || (newScore === 1 && gameState.settings['check-out'] !== 'Single Out');
    
    player.legDarts += 3; player.totalDarts += 3;
    gameState.legJustFinished = false; gameState.matchJustFinished = false;

    if (isBust) {
        player.lastThrow = `BUST (${score})`;
    } else {
        player.score = newScore;
        player.lastThrow = score;
        player.totalScore += score;
        player.allThrows.push(score);
    }
    
    if(gameState.settings['check-out'] !== 'Single Out' && checkoutPaths[scoreBefore]) {
        player.checkoutAttempts++;
    }

    gameState.currentPlayer = playerKey === 'p1' ? 'p2' : 'p1';
    return gameState;
}
const checkoutPaths={170:"T20-T20-Bull",167:"T20-T19-Bull",164:"T20-T18-Bull",161:"T20-T17-Bull",160:"T20-T20-D20",158:"T20-T20-D19",157:"T20-T19-D20",156:"T20-T20-D18",155:"T20-T19-D19",154:"T20-T18-D20",153:"T20-T19-D18",152:"T20-T20-D16",151:"T20-T17-D20",150:"T20-T18-D18",149:"T20-T19-D16",148:"T20-T16-D20",147:"T20-T17-D18",146:"T20-T18-D16",145:"T20-T15-D20",144:"T20-T20-D12",143:"T20-T17-D16",142:"T20-T14-D20",141:"T20-T19-D12",140:"T20-T20-D10",139:"T19-T20-D11",138:"T20-T18-D12",137:"T19-T20-D10",136: