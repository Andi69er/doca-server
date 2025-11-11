// game.js

export default class Game {
    constructor(players, options) {
        this.players = players; // Array mit clientIds
        this.options = {
            startingScore: 501,
            finishType: "Double Out",
            ...options
        };
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;
        this.turnThrows = [];
        this.scores = {};
        this.players.forEach(pId => {
            this.scores[pId] = parseInt(this.options.startingScore || 501);
        });
    }

    getCurrentPlayerId() {
        return this.players[this.currentPlayerIndex];
    }

    getState() {
        return {
            isStarted: this.isStarted,
            winner: this.winner,
            scores: this.scores,
            currentPlayerId: this.getCurrentPlayerId(),
            turnThrows: this.turnThrows,
            options: this.options,
        };
    }

    handleAction(clientId, action) {
        if (this.winner) return false;

        switch (action.type) {
            case "player_throw":
                // Das 'payload' Objekt wird vom Client in ws.js so verschickt
                return this.handleThrow(clientId, action.payload.points);
            case "undo_throw":
                return this.handleUndo(clientId);
            default:
                return false;
        }
    }

    handleThrow(clientId, points) {
        if (clientId !== this.getCurrentPlayerId()) return false;
        if (typeof points !== 'number' || points < 0 || points > 180) return false;

        const currentScore = this.scores[clientId];
        const newScore = currentScore - points;

        // Bust-Logik (überworfen)
        if (newScore < 0 || newScore === 1) {
            this.nextPlayer();
            return true;
        }
        
        // Checkout-Logik
        if (newScore === 0) {
            // Für eine vollständige Implementierung müsste hier die "Double Out"-Bedingung geprüft werden.
            this.scores[clientId] = 0;
            this.winner = clientId;
            console.log(`Spiel gewonnen von ${clientId}`);
            return true;
        }

        // Gültiger Wurf
        this.scores[clientId] = newScore;
        this.turnThrows.push(points);

        if (this.turnThrows.length >= 3) {
            this.nextPlayer();
        }
        return true;
    }
    
    handleUndo(clientId) {
        if (clientId !== this.getCurrentPlayerId()) return false;
        if (this.turnThrows.length === 0) return false;
        
        const lastThrow = this.turnThrows.pop();
        this.scores[clientId] += lastThrow;
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnThrows = [];
    }
}