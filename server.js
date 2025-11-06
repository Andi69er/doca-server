// server.js - Version 12 (stabil)

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
    if (isBust) { player.lastThrow = `BUST (${score})`; } 
    else { player.score = newScore; player.lastThrow = score; player.totalScore += score; player.allThrows.push(score); }
    if(gameState.settings['check-out'] !== 'Single Out' && checkoutPaths[scoreBefore]) { player.checkoutAttempts++; }
    gameState.currentPlayer = playerKey === 'p1' ? 'p2' : 'p1';
    return gameState;
}
const checkoutPaths={170:"T20-T20-Bull",167:"T20-T19-Bull",164:"T20-T18-Bull",161:"T20-T17-Bull",160:"T20-T20-D20",158:"T20-T20-D19",157:"T20-T19-D20",156:"T20-T20-D18",155:"T20-T19-D19",154:"T20-T18-D20",153:"T20-T19-D18",152:"T20-T20-D16",151:"T20-T17-D20",150:"T20-T18-D18",149:"T20-T19-D16",148:"T20-T16-D20",147:"T20-T17-D18",146:"T20-T18-D16",145:"T20-T15-D20",144:"T20-T20-D12",143:"T20-T17-D16",142:"T20-T14-D20",141:"T20-T19-D12",140:"T20-T20-D10",139:"T19-T20-D11",138:"T20-T18-D12",137:"T19-T20-D10",136:"T20-T20-D8",135:"T20-T17-D12",134:"T20-T14-D16",133:"T20-T19-D8",132:"T20-T16-D12",131:"T20-T13-D16",130:"T20-T20-D5",129:"T19-T16-D12",128:"T18-T14-D16",127:"T20-T17-D8",126:"T19-T19-D6",125:"Bull-T15-D20",124:"T20-T16-D8",123:"T19-T16-D9",122:"T18-T20-D4",121:"T20-T11-D14",120:"T20-20-D20",119:"T19-T12-D13",118:"T20-18-D20",117:"T20-17-D20",116:"T20-16-D20",115:"T20-15-D20",114:"T20-T14-D20",113:"T19-16-D20",112:"T20-12-D20",111:"T20-T11-D20",110:"T20-10-D20",109:"T19-T12-D20",108:"T20-8-D20",107:"T19-10-D20",106:"T20-6-D20",105:"T19-8-D20",104:"T18-10-D20",103:"T19-6-D20",102:"T20-2-D20",101:"T17-10-D20",100:"T20-D20",99:"T19-D20",98:"T20-D19",97:"T19-D20",96:"T20-D18",95:"T19-D19",94:"T18-D20",93:"T19-D18",92:"T20-D16",91:"T17-D20",90:["T20-D15","Bull-D20","T18-D18"],89:"T19-D16",88:["T20-D14","T16-D20"],87:"T17-D18",86:"T18-D16",85:"T15-D20",84:["T20-D12","T16-D18"],83:"T17-D16",82:["Bull-D16","T14-D20"],81:"T19-D12",80:"T20-D10",79:"T13-D20",78:"T18-D12",77:"T19-D10",76:["T20-D8","T16-D14"],75:"T17-D12",74:"T14-D16",73:"T19-D8",72:"T16-D12",71:"T13-D16",70:"T18-D8",69:"T19-D6",68:"T20-D4",67:"T17-D8",66:["T10-D18","T14-D12","16-Bull"],65:["Bull-D20","T15-D10","T11-D16"],64:["T16-D8","T8-D20"],63:"T13-D12",62:"T10-D16",61:"T15-D8",60:"20-D20",59:"19-D20",58:"18-D20",57:"17-D20",56:["16-D20","T12-D10","20-D18"],55:"15-D20",54:"14-D20",53:"13-D20",52:"12-D20",51:"19-D16",50:"10-D20",49:"9-D20",48:"8-D20",47:"15-D16",46:"6-D20",45:"13-D16",44:"4-D20",43:"3-D20",42:"2-D20",41:"9-D16",40:"D20",39:"7-D16",38:"D19",37:"5-D16",36:"D18",35:"3-D16",34:"D17",33:"1-D16",32:"D16",31:"7-D12",30:"D15",29:"5-D12",28:"D14",27:"7-D10",26:"D13",25:"9-D8",24:"D12",23:"7-D8",22:"D11",21:"5-D8",20:"D10",19:"3-D8",18:"D9",17:"1-D8",16:"D8",15:"7-D4",14:"D7",13:"5-D4",12:"D6",11:"3-D4",10:"D5",9:"1-D4",8:"D4",7:"3-D2",6:"D3",5:"1-D2",4:"D2",3:"1-D1",2:"D1"};
function broadcast(data) { const message = JSON.stringify(data); gameRoom.players.forEach(player => { if (player.ws.readyState === WebSocket.OPEN) { player.ws.send(message); } }); }
wss.on('connection', ws => {
    if (gameRoom.players.length >= 2) { ws.send(JSON.stringify({ type: 'error', message: 'Das Spiel ist bereits voll.' })); ws.close(); return; }
    const playerIndex = gameRoom.players.length; const playerKey = `p${playerIndex + 1}`;
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
                    case 'start_game': if (gameRoom.gameSettings) { gameRoom.gameState = createInitialGameState(gameRoom.gameSettings); gameRoom.lastState = null; broadcast({ type: 'start_game', gameState: gameRoom.gameState }); } break;
                    case 'new_game': gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.lastState = null; broadcast({ type: 'new_game' }); break;
                    case 'settings_update': gameRoom.gameSettings = data.settings; const guest = gameRoom.players[1]; if (guest) guest.ws.send(JSON.stringify({ type: 'settings_update', settings: data.settings })); break;
                }
            }
            if (data.type === 'submit_score') { if (gameRoom.gameState && gameRoom.gameState.currentPlayer === sourcePlayerKey) { gameRoom.lastState = JSON.parse(JSON.stringify(gameRoom.gameState)); gameRoom.gameState = processScore(gameRoom.gameState, data.score); broadcast({ type: 'game_update', gameState: gameRoom.gameState }); } }
            if (data.type === 'submit_checkout') { if (gameRoom.gameState && gameRoom.gameState.currentPlayer === sourcePlayerKey) { gameRoom.lastState = JSON.parse(JSON.stringify(gameRoom.gameState)); gameRoom.gameState = finishLeg(gameRoom.gameState, data.score, data.darts); broadcast({ type: 'game_update', gameState: gameRoom.gameState }); } }
            if (data.type === 'undo_throw') { if (gameRoom.lastState) { if (gameRoom.gameState.currentPlayer !== sourcePlayerKey) { gameRoom.gameState = gameRoom.lastState; gameRoom.lastState = null; broadcast({ type: 'game_update', gameState: gameRoom.gameState }); } } }
        } catch(e) { console.error("Fehler bei Nachrichtenverarbeitung:", e); }
    });
    ws.on('close', () => { console.log(`Spieler ${playerIndex + 1} hat die Verbindung getrennt.`); gameRoom.players = gameRoom.players.filter(p => p.ws !== ws); if (gameRoom.players.length < 2 && gameRoom.gameState) { gameRoom.gameState = null; gameRoom.gameSettings = null; gameRoom.lastState = null; if (gameRoom.players.length === 1) { gameRoom.players[0].ws.send(JSON.stringify({ type: 'new_game' })); } } });
});
console.log(`Finaler Spiel-Server (Version 12 - Match-Statistik) gestartet`);