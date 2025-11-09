// gameLogic.js — Das Gehirn des Dart-Spiels

export class Game {
    constructor(players, options) {
        this.players = players; // ['playerId1', 'playerId2']
        this.options = options;
        
        this.startingScore = parseInt(options.distance) || 501;
        this.finishType = options.finish || 'Double Out';

        this.resetGame();
    }

    resetGame() {
        this.scores = {};
        this.stats = {};
        this.players.forEach(p => {
            this.scores[p] = this.startingScore;
            this.stats[p] = { dartsThrown: 0, totalScore: 0, legsWon: 0 };
        });

        this.currentPlayerIndex = 0;
        this.winner = null;
        this.isStarted = false;
        this.turnThrows = []; // Speichert die 3 Würfe der aktuellen Runde
        this.history = []; // Speichert alle Würfe des Legs
        this.scoreAtTurnStart = this.startingScore;
    }

    start() {
        this.resetGame();
        this.isStarted = true;
        console.log(`Spiel gestartet! Modus: ${this.startingScore}. Spieler:`, this.players);
        return this.getState();
    }

    // Verarbeitet einen einzelnen Wurf
    playerThrow(playerId, value, mult) {
        if (!this.isStarted || this.winner || playerId !== this.players[this.currentPlayerIndex] || this.turnThrows.length >= 3) {
            return this.getState(); // Spiel nicht aktiv oder falscher Spieler
        }

        const throwScore = value * mult;
        const currentScore = this.scores[playerId];

        // Bust-Logik
        if (currentScore - throwScore < 0 || currentScore - throwScore === 1 || (currentScore - throwScore === 0 && this.finishType === 'Double Out' && mult !== 2)) {
            console.log(`${playerId} hat überworfen (Bust)!`);
            this.nextPlayer();
            return this.getState();
        }

        // Gültiger Wurf
        this.scores[playerId] -= throwScore;
        const throwObj = { playerId, value, mult, score: throwScore };
        this.turnThrows.push(throwObj);
        this.history.push(throwObj);
        this.stats[playerId].dartsThrown++;
        this.stats[playerId].totalScore += throwScore;

        // Gewinn-Prüfung
        if (this.scores[playerId] === 0) {
            this.winner = playerId;
            this.isStarted = false;
            this.stats[playerId].legsWon++;
            console.log(`GEWINNER! ${playerId} hat das Leg gewonnen!`);
        } else if (this.turnThrows.length === 3) {
            this.nextPlayer();
        }

        return this.getState();
    }

    undoLastThrow(playerId) {
        if (!this.isStarted || playerId !== this.players[this.currentPlayerIndex] || this.turnThrows.length === 0) {
            return this.getState(); // Undo nicht möglich
        }

        const lastThrow = this.turnThrows.pop();
        this.history.pop();

        this.scores[lastThrow.playerId] += lastThrow.score;
        this.stats[lastThrow.playerId].dartsThrown--;
        this.stats[lastThrow.playerId].totalScore -= lastThrow.score;

        console.log(`${playerId} hat den letzten Wurf rückgängig gemacht.`);
        return this.getState();
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnThrows = [];
        this.scoreAtTurnStart = this.scores[this.players[this.currentPlayerIndex]];
    }

    // Gibt den aktuellen, kompletten Spielzustand zurück
    getState() {
        const currentPlayerId = this.winner ? null : this.players[this.currentPlayerIndex];
        
        // Live-Stats berechnen
        const liveStats = {};
        this.players.forEach(p => {
            liveStats[p] = {
                avg: this.stats[p].dartsThrown > 0 ? ((this.stats[p].totalScore / this.stats[p].dartsThrown) * 3).toFixed(2) : '0.00'
            };
        });

        return {
            type: "game_state",
            isStarted: this.isStarted,
            players: this.players,
            scores: this.scores,
            currentPlayerId: currentPlayerId,
            turnThrows: this.turnThrows,
            lastThrow: this.history.length > 0 ? this.history[this.history.length - 1] : null,
            winner: this.winner,
            options: this.options,
            liveStats: liveStats,
        };
    }
}