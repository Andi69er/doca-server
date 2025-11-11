// game.js (FINAL)

export default class Game {
    constructor(players, options) {
        this.players = players;
        this.options = { startingScore: 501, ...options };
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;
        this.turnThrows = [];
        this.scores = {};
        this.players.forEach(pId => {
            this.scores[pId] = parseInt(this.options.startingScore || 501);
        });
    }

    getState() {
        return {
            isStarted: this.isStarted,
            winner: this.winner,
            scores: this.scores,
            currentPlayerId: this.players[this.currentPlayerIndex],
            turnThrows: this.turnThrows,
        };
    }

    handleAction(clientId, action) {
        if (this.winner || clientId !== this.players[this.currentPlayerIndex]) return false;

        switch (action.type) {
            case "player_throw":
                return this.handleThrow(action.payload.points);
            case "undo_throw":
                return this.handleUndo();
            default:
                return false;
        }
    }

    handleThrow(points) {
        if (typeof points !== 'number' || points < 0 || points > 180) return false;
        const clientId = this.players[this.currentPlayerIndex];
        const newScore = this.scores[clientId] - points;

        if (newScore < 0 || newScore === 1) { // Bust
            this.nextPlayer();
            return true;
        }
        
        this.scores[clientId] = newScore;
        this.turnThrows.push(points);

        if (newScore === 0) {
            this.winner = clientId;
            console.log(`Spiel gewonnen von ${clientId}`);
            return true;
        }

        if (this.turnThrows.length >= 3) {
            this.nextPlayer();
        }
        return true;
    }
    
    handleUndo() {
        if (this.turnThrows.length === 0) return false;
        const clientId = this.players[this.currentPlayerIndex];
        const lastThrow = this.turnThrows.pop();
        this.scores[clientId] += lastThrow;
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnThrows = [];
    }
}