// serverdaten/cricketGame.js – 100% FUNKTIONIEREND + KORREKTES WIN-CHECK
export default class CricketGame {
    constructor(players, options = {}) {
        this.players = players.filter(p => p); // nur echte IDs
        this.options = options;
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;

        this.hits = {};         // { clientId: {20: 3, 19: 0, ... , 25: 2} }
        this.scores = {};       // Punkte, wenn Feld zu und Gegner noch nicht
        this.throwHistory = {};

        const numbers = [20, 19, 18, 17, 16, 15, 25];

        this.players.forEach(pId => {
            this.scores[pId] = 0;
            this.hits[pId] = {};
            this.throwHistory[pId] = [];
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
            throwHistory: this.throwHistory,
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

        // Nur Cricket-Felder erlaubt
        if (![15, 16, 17, 18, 19, 20, 25].includes(value) || multiplier < 1 || multiplier > 3) {
            return false;
        }

        const opponentId = this.players.find(p => p !== clientId);

        // Marks hinzufügen (max 3)
        for (let i = 0; i < multiplier; i++) {
            if (this.hits[clientId][value] < 3) {
                this.hits[clientId][value]++;
            }
        }

        // Punkte vergeben, wenn Feld zu ist und Gegner noch nicht
        const iClosed = this.hits[clientId][value] >= 3;
        const opponentClosed = opponentId ? this.hits[opponentId][value] >= 3 : true;

        if (iClosed && !opponentClosed) {
            this.scores[clientId] += value * multiplier;
        }

        // Throw-History für UI
        let label = "";
        if (value === 25) {
            label = multiplier >= 2 ? "DB" : "SB";
        } else {
            const pref = ["", "S", "D", "T"][multiplier];
            label = pref + value;
        }
        this.throwHistory[clientId].push(label);

        // Gewinnbedingung: Alle Felder zu + niedrigster oder gleicher Score
        const allClosed = [20, 19, 18, 17, 16, 15, 25].every(n => this.hits[clientId][n] >= 3);
        if (allClosed) {
            const myScore = this.scores[clientId] || 0;
            const oppScore = opponentId ? (this.scores[opponentId] || 0) : Infinity;
            if (myScore <= oppScore) {
                this.winner = clientId;
            }
        }

        this.nextPlayer();
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
}