// serverdaten/cricketGame.js (KORRIGIERT - OHNE DEN FEHLERHAFTEN SELBST-IMPORT)
// Eigene Spiel-Logik Klasse nur für Cricket

export default class CricketGame {
    constructor(players, options) {
        this.players = players; // [clientId1, clientId2]
        this.options = options;
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;
        
        // Cricket-spezifischer Zustand
        this.hits = {}; // { clientId: { '20': 1, '19': 3, ... } }
        this.scores = {}; // { clientId: 120 }
        this.closedNumbers = {}; // { clientId: { '20': true, ... } }
        this.throwHistory = {}; // { clientId: ['T20', 'S19', ...] }

        this.players.forEach(pId => {
            if (pId) {
                this.scores[pId] = 0;
                this.hits[pId] = { '20': 0, '19': 0, '18': 0, '17': 0, '16': 0, '15': 0, '25': 0 };
                this.closedNumbers[pId] = {};
                this.throwHistory[pId] = [];
            }
        });
    }

    getState() {
        return {
            isStarted: this.isStarted,
            winner: this.winner,
            players: this.players,
            currentPlayerId: this.players[this.currentPlayerIndex],
            options: this.options,
            throwHistory: this.throwHistory,
            // Cricket-spezifischer Zustand für die UI
            cricketState: {
                hits: this.hits,
                scores: this.scores,
            }
        };
    }

    handleAction(clientId, action) {
        if (this.winner || clientId !== this.players[this.currentPlayerIndex]) {
            return false;
        }

        if (action.type === "player_throw") {
            return this.handleThrow(clientId, action.payload); // payload is { value, multiplier }
        }
        
        // Hier könnte man später eine Undo-Logik für Cricket einbauen
        return false;
    }

    handleThrow(clientId, dart) {
        // dart = { value: 20, multiplier: 3 }
        const { value, multiplier } = dart;
        const validTargets = [20, 19, 18, 17, 16, 15, 25];

        if (!validTargets.includes(value) || !multiplier) return false;

        const opponentId = this.players.find(p => p !== clientId);

        for (let i = 0; i < multiplier; i++) {
            if (this.hits[clientId][value] < 3) {
                this.hits[clientId][value]++;
            } else {
                // Spieler hat das Feld schon zu, jetzt wird gepunktet
                // Bedingung: Der Gegner darf das Feld noch nicht zu haben
                if (opponentId && !this.closedNumbers[opponentId]?.[value]) {
                    this.scores[clientId] += value;
                }
            }
        }
        
        // Prüfen, ob ein Feld geschlossen wurde
        validTargets.forEach(num => {
            if (this.hits[clientId][num] >= 3) this.closedNumbers[clientId][num] = true;
            if (opponentId && this.hits[opponentId][num] >= 3) this.closedNumbers[opponentId][num] = true;
        });

        // Wurf zur Historie hinzufügen
        const prefix = {1: 'S', 2: 'D', 3: 'T'}[multiplier] || '';
        let target;
        if (value === 25) {
            target = (multiplier === 1) ? 'SB' : 'DB';
            this.throwHistory[clientId].push(target);
        } else {
            target = value;
            this.throwHistory[clientId].push(prefix + target);
        }

        this.checkWinCondition(clientId);

        // Nach jedem Wurf den Spieler wechseln
        this.nextPlayer();
        return true;
    }

    checkWinCondition(clientId) {
        const opponentId = this.players.find(p => p !== clientId);
        if (!opponentId) return;
        
        const clientHasAllClosed = Object.keys(this.hits[clientId]).every(num => this.hits[clientId][num] >= 3);

        if (clientHasAllClosed && this.scores[clientId] >= this.scores[opponentId]) {
            this.winner = clientId;
        }
    }

    nextPlayer() {
        if (this.winner) return;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
}