// serverdaten/cricketGame.js – 100% FUNKTIONIEREND + KORREKTES WIN-CHECK
export default class CricketGame {
    constructor(players, options = {}) {
        this.players = players.filter(p => p); // nur echte IDs
        this.options = options;
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;
        this.turnThrows = [];

        this.hits = {};         // { clientId: {20: 3, 19: 0, ... , 25: 2} }
        this.scores = {};       // Punkte, wenn Feld zu und Gegner noch nicht
        
        const numbers = [20, 19, 18, 17, 16, 15, 25];

        this.players.forEach(pId => {
            this.scores[pId] = 0;
            this.hits[pId] = {};
            numbers.forEach(n => this.hits[pId][n] = 0);
        });
    }

    getState() {
        return {
            gameMode: "cricket",
            isStarted: this.isStarted,
            winner: this.winner,
            players: this.players,
            currentPlayerId: this.players[this.currentPlayerIndex],
            options: this.options,
            turnThrows: this.turnThrows,
            cricketState: {
                hits: this.hits,
                scores: this.scores
            }
        };
    }

    handleAction(clientId, action) {
        if (this.winner) return false;
        if (clientId !== this.players[this.currentPlayerIndex]) return false;

        if (action.type === "player_throw") {
            return this.handleThrow(clientId, action.payload);
        }
        return false;
    }

    handleThrow(clientId, payload) {
        const { value, multiplier = 1 } = payload;
        if (![15, 16, 17, 18, 19, 20, 25].includes(value) || multiplier < 1 || multiplier > 3) {
            return false;
        }

        const opponentId = this.players.find(p => p !== clientId);

        for (let i = 0; i < multiplier; i++) {
            if (this.hits[clientId][value] < 3) {
                this.hits[clientId][value]++;
            } else { // Feld ist bereits zu, also Punkte machen
                const opponentClosed = opponentId ? this.hits[opponentId][value] >= 3 : true;
                if (!opponentClosed) {
                    this.scores[clientId] += (value === 25 ? 25 : value);
                }
            }
        }
        
        this.turnThrows.push({value, multiplier});

        // Gewinnbedingung prüfen
        const allClosed = [20, 19, 18, 17, 16, 15, 25].every(n => this.hits[clientId][n] >= 3);
        if (allClosed) {
            const myScore = this.scores[clientId] || 0;
            const oppScore = opponentId ? (this.scores[opponentId] || 0) : -1;
            if (myScore >= oppScore) {
                this.winner = clientId;
                return true;
            }
        }
        
        if (this.turnThrows.length >= 3) {
            this.nextPlayer();
        }

        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnThrows = [];
    }
}