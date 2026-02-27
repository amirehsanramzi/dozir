const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname)));

let waitingPlayer = null;
let games = {};
let spectators = [];

io.on('connection', (socket) => {
    console.log('یه نفر وصل شد:', socket.id);

    // اگه بازی در حال انجام هست، تماشاگر کن
    if (Object.keys(games).length > 0) {
        socket.emit('spectatorMode', { games: Object.values(games) });
        spectators.push(socket.id);
        return;
    }

    // اگه بازیکن منتظر هست، بازی رو شروع کن
    if (waitingPlayer) {
        const gameId = `game_${Date.now()}`;
        const player1 = waitingPlayer;
        const player2 = socket.id;
        
        games[gameId] = {
            id: gameId,
            players: [player1, player2],
            board: Array(9).fill(null),
            currentPlayer: 'X',
            moves: [],
            winner: null,
            startTime: Date.now(),
            timers: { X: 60, O: 60 },
            lastMoveTime: Date.now()
        };

        io.to(player1).emit('gameStart', { 
            symbol: 'X', 
            gameId, 
            opponent: player2,
            timer: 60
        });
        
        io.to(player2).emit('gameStart', { 
            symbol: 'O', 
            gameId, 
            opponent: player1,
            timer: 60
        });

        waitingPlayer = null;
    } else {
        waitingPlayer = socket.id;
        socket.emit('waiting', 'منتظر بازیکن دوم...');
    }

    socket.on('makeMove', ({ gameId, index, symbol }) => {
        const game = games[gameId];
        if (!game || game.winner) return;

        const playerIndex = game.players.indexOf(socket.id);
        if (playerIndex === -1) return;
        
        const playerSymbol = playerIndex === 0 ? 'X' : 'O';
        if (playerSymbol !== game.currentPlayer) return;
        if (game.board[index]) return;

        // محاسبه زمان
        const timeSpent = Math.floor((Date.now() - game.lastMoveTime) / 1000);
        game.timers[game.currentPlayer] -= timeSpent;
        if (game.timers[game.currentPlayer] <= 0) {
            game.winner = game.currentPlayer === 'X' ? 'O' : 'X';
            io.to(game.players[0]).to(game.players[1]).emit('gameOver', {
                winner: game.winner,
                reason: 'timeout',
                timers: game.timers
            });
            return;
        }

        game.board[index] = symbol;
        game.moves.push({ player: symbol, position: index, time: Date.now() });
        game.lastMoveTime = Date.now();

        // بررسی برنده
        const winner = checkWinner(game.board);
        if (winner) {
            game.winner = winner;
            io.to(game.players[0]).to(game.players[1]).emit('gameOver', {
                winner,
                reason: 'win',
                moves: game.moves,
                timers: game.timers
            });
            
            // به تماشاگرها هم بگو
            spectators.forEach(specId => {
                io.to(specId).emit('gameUpdate', { 
                    board: game.board, 
                    gameId,
                    winner 
                });
            });
        } else {
            game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
            
            // ارسال به بازیکن‌ها
            io.to(game.players[0]).to(game.players[1]).emit('moveMade', {
                board: game.board,
                currentPlayer: game.currentPlayer,
                timers: game.timers
            });

            // ارسال به تماشاگرها
            spectators.forEach(specId => {
                io.to(specId).emit('gameUpdate', { 
                    board: game.board, 
                    gameId,
                    currentPlayer: game.currentPlayer 
                });
            });
        }
    });

    socket.on('resetGame', (gameId) => {
        const game = games[gameId];
        if (game) {
            game.board = Array(9).fill(null);
            game.currentPlayer = game.winner || 'X';
            game.moves = [];
            game.winner = null;
            game.lastMoveTime = Date.now();
            game.timers = { X: 60, O: 60 };

            io.to(game.players[0]).to(game.players[1]).emit('gameReset', {
                board: game.board,
                currentPlayer: game.currentPlayer,
                timers: game.timers
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('یه نفر رفت:', socket.id);
        
        // پاک کردن از منتظرین
        if (waitingPlayer === socket.id) {
            waitingPlayer = null;
        }

        // پاک کردن از تماشاگرها
        spectators = spectators.filter(id => id !== socket.id);

        // پاک کردن از بازی‌ها
        for (let gameId in games) {
            const game = games[gameId];
            if (game.players.includes(socket.id)) {
                delete games[gameId];
                io.to(game.players[0]).to(game.players[1]).emit('opponentLeft');
                break;
            }
        }
    });
});

function checkWinner(board) {
    const lines = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];

    for (let line of lines) {
        const [a,b,c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`سرور روی پورت ${PORT} روشن شد`);
});