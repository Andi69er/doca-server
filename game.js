// game.js (REBUILT FROM STABLE BASE)
export default class Game {
    constructor(players, options) {
        this.players = players; // Array of clientIds
        this.options = { startingScore: 501, ...options };
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;
        
        this.scores = {};
        this.throwHistory = {}; // Persistent history for the game

        players.forEach(pId => {
            if (pId) {
                this.scores[pId] = parseInt(this.options.startingScore);
                this.throwHistory[pId] = []; // Initialize history for each player
            }
        });
    }

    getState() {
        return {
            isStarted: this.isStarted,
            winner: this.winner,
            scores: this.scores,
            currentPlayerId: this.players[this.currentPlayerIndex],
            players: this.players,
            options: this.options,
            throwHistory: this.throwHistory,
        };
    }

    handleAction(clientId, action) {
        if (this.winner) {
            return false;
        }

        if (action.type === "undo_throw") {
            // Undo kann nur vom Spieler ausgelöst werden, der den letzten Wurf gemacht hat.
            const lastPlayerIndex = (this.currentPlayerIndex + this.players.length - 1) % this.players.length;
            const lastPlayerId = this.players[lastPlayerIndex];
            if (clientId === lastPlayerId) {
                return this.handleUndo(clientId);
            }
            return false;
        }

        // Für alle anderen Aktionen muss der Spieler an der Reihe sein.
        if (clientId !== this.players[this.currentPlayerIndex]) {
            return false;
        }
        
        if (action.type === "player_throw") {
            return this.handleThrow(clientId, action.payload.points);
        }

        return false;
    }

    handleThrow(clientId, points) {
        if (typeof points !== 'number' || points < 0 || points > 180) {
            return false;
        }

        const currentScore = this.scores[clientId];
        const newScore = currentScore - points;

        if (newScore < 0 || newScore === 1) { // Bust-Logik
            this.throwHistory[clientId].push('BUST');
            this.nextPlayer();
            return true;
        }

        this.scores[clientId] = newScore;
        this.throwHistory[clientId].push(points);

        if (newScore === 0) { // Checkout
            // Hier müsste noch die "Double Out"-Bedingung geprüft werden, falls implementiert.
            this.winner = clientId;
            return true;
        }
        
        // Nach 3 Würfen (oder einem Wurf, je nach Regelwerk) Spieler wechseln
        // Annahme: Ein "player_throw" ist eine Aufnahme von 3 Darts
        this.nextPlayer();
        return true;
    }

    handleUndo(clientId) {
        const lastPlayerIndex = (this.currentPlayerIndex + this.players.length - 1) % this.players.length;
        const lastPlayerId = this.players[lastPlayerIndex];

        if (clientId !== lastPlayerId) return false;
        if (!this.throwHistory[lastPlayerId] || this.throwHistory[lastPlayerId].length === 0) return false;

        const lastThrow = this.throwHistory[lastPlayerId].pop();
        if(lastThrow !== 'BUST') {
            this.scores[lastPlayerId] += lastThrow;
        }

        // Den Spieler wieder an die Reihe setzen
        this.currentPlayerIndex = lastPlayerIndex;
        this.winner = null;
        
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
}