// serverdaten/cricketGame.js
export default class CricketGame {
    constructor(players, options = {}) {
        this.players = players.filter(p => p);
        this.options = options;
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;

        this.hits = {};
        this.scores = {};
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
        if (![15,16,17,18,19,20,25].includes(value) || multiplier < 1 || multiplier > 3) return false;

        const opponentId = this.players.find(p => p !== clientId);
        const marksToAdd = multiplier;

        for (let i = 0; i < marksToAdd; i++) {
            if (this.hits[clientId][value] < 3) {
                this.hits[clientId][value]++;
            }
        }

        const iClosed = this.hits[clientId][value] >= 3;
        const opponentClosed = opponentId ? this.hits[opponentId][value] >= 3 : true;
        if (iClosed && !opponentClosed) {
            this.scores[clientId] += value * multiplier;
        }

        let label = "";
        if (value === 25) {
            label = multiplier >= 2 ? "DB" : "SB";
        } else {
            const pref = ["", "S", "D", "T"][multiplier];
            label = pref + value;
        }
        this.throwHistory[clientId].push(label);

        const allClosed = [20,19,18,17,16,15,25].every(n => this.hits[clientId][n] >= 3);
        if (allClosed) {
            if (!opponentId || this.scores[clientId] <= (this.scores[opponentId] || 0)) {
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