// game.js (MODIFIZIERT FÜR UNDO-VERZÖGERUNG)
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

        // Nur der aktuelle Spieler kann Aktionen (Wurf, Undo) ausführen
        if (clientId !== this.players[this.currentPlayerIndex]) {
            return false;
        }
        
        switch (action.type) {
            case "player_throw":
                return this.handleThrow(clientId, action.payload.points);
            case "undo_throw":
                return this.handleUndo(clientId);
            default:
                return false;
        }
    }

    handleThrow(clientId, points) {
        if (typeof points !== 'number' || points < 0 || points > 180) {
            return false;
        }

        const currentScore = this.scores[clientId];
        const newScore = currentScore - points;

        if (newScore < 0 || newScore === 1) { // Bust-Logik
            this.throwHistory[clientId].push(0); // Ein Bust wird als 0 Punkte gewertet
            // Spielerwechsel wird vom RoomManager nach der Verzögerung durchgeführt
            return true;
        }

        this.scores[clientId] = newScore;
        this.throwHistory[clientId].push(points);

        if (newScore === 0) { // Checkout-Logik
            this.winner = clientId;
            // Kein Spielerwechsel bei einem Sieg
        }
        
        return true;
    }

    handleUndo(clientId) {
        // Da der Spielerwechsel verzögert wird, ist der aktuelle Spieler derjenige, der den Wurf rückgängig machen muss.
        // Die Prüfung in handleAction stellt bereits sicher, dass clientId === currentPlayerId.

        // Prüfen, ob es einen Wurf zum Rückgängigmachen gibt.
        if (!this.throwHistory[clientId] || this.throwHistory[clientId].length === 0) {
            return false;
        }

        // Letzten Wurf entfernen und die Punkte wieder zum Score addieren.
        const lastThrow = this.throwHistory[clientId].pop();
        this.scores[clientId] += lastThrow;
        
        // Siegerstatus aufheben, falls der Siegeswurf rückgängig gemacht wurde.
        this.winner = null; 
        
        return true;
    }

    nextPlayer() {
        // Wird jetzt vom RoomManager nach der Verzögerung aufgerufen
        if(this.winner) return; // Kein Spielerwechsel bei einem Sieg
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
}