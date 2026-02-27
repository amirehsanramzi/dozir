const socket = io();
let currentSymbol = null;
let currentGameId = null;
let myTurn = false;
let board = Array(9).fill(null);
let gameActive = false;
let timers = { X: 60, O: 60 };
let timerInterval = null;

// المنت‌های DOM
const statusDiv = document.getElementById('status');
const symbolSelection = document.getElementById('symbolSelection');
const gameBoard = document.getElementById('gameBoard');
const waitingRoom = document.getElementById('waitingRoom');
const spectatorMode = document.getElementById('spectatorMode');
const boardElement = document.getElementById('board');
const playerX = document.getElementById('playerX');
const playerO = document.getElementById('playerO');
const timerX = document.getElementById('timerX');
const timerO = document.getElementById('timerO');
const movesCount = document.getElementById('movesCount');
const gameResults = document.getElementById('gameResults');
const winnerDisplay = document.getElementById('winnerDisplay');
const movesHistory = document.getElementById('movesHistory');
const resetBtn = document.getElementById('resetBtn');
const spectatorBoard = document.getElementById('spectatorBoard');

// ساخت صفحه بازی
function createBoard() {
    boardElement.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.onclick = () => makeMove(i);
        boardElement.appendChild(cell);
    }
}

// انتخاب نماد
function selectSymbol(symbol) {
    currentSymbol = symbol;
    symbolSelection.classList.add('hidden');
    waitingRoom.classList.remove('hidden');
    statusDiv.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> منتظر بازیکن دوم...';
}

// حرکت جدید
function makeMove(index) {
    if (!myTurn || !gameActive || board[index]) return;
    
    socket.emit('makeMove', {
        gameId: currentGameId,
        index,
        symbol: currentSymbol
    });
}

// آپدیت برد
function updateBoard(newBoard) {
    board = newBoard;
    const cells = document.querySelectorAll('.cell');
    cells.forEach((cell, i) => {
        cell.innerHTML = '';
        if (board[i]) {
            const icon = document.createElement('i');
            icon.className = board[i] === 'X' ? 'fas fa-circle' : 'fas fa-times';
            icon.style.color = board[i] === 'X' ? '#6dd5ed' : '#ff6a00';
            cell.appendChild(icon);
        }
    });
}

// شروع بازی
socket.on('gameStart', (data) => {
    currentGameId = data.gameId;
    currentSymbol = data.symbol;
    myTurn = data.symbol === 'X';
    gameActive = true;
    timers = { X: data.timer, O: data.timer };
    
    waitingRoom.classList.add('hidden');
    gameBoard.classList.remove('hidden');
    createBoard();
    
    statusDiv.innerHTML = `<i class="fas fa-check-circle"></i> بازی شروع شد! نماد شما: ${data.symbol === 'X' ? 'آبی' : 'قرمز'}`;
    
    if (myTurn) {
        playerX.classList.add('active');
    } else {
        playerO.classList.add('active');
    }
    
    startTimers();
});

// حرکت انجام شد
socket.on('moveMade', (data) => {
    updateBoard(data.board);
    myTurn = data.currentPlayer === currentSymbol;
    timers = data.timers;
    
    if (myTurn) {
        playerX.classList.add('active');
        playerO.classList.remove('active');
    } else {
        playerX.classList.remove('active');
        playerO.classList.add('active');
    }
    
    const moveCount = data.board.filter(cell => cell !== null).length;
    movesCount.innerHTML = `تعداد حرکت: ${moveCount}`;
});

// بازی تمام شد
socket.on('gameOver', (data) => {
    gameActive = false;
    clearInterval(timerInterval);
    
    let winnerText = '';
    if (data.reason === 'timeout') {
        winnerText = `بازیکن ${data.winner === 'X' ? 'آبی' : 'قرمز'} به دلیل اتمام زمان حریف برنده شد!`;
    } else {
        winnerText = `بازیکن ${data.winner === 'X' ? 'آبی' : 'قرمز'} برنده شد! 🎉`;
    }
    
    winnerDisplay.innerHTML = `
        <i class="fas ${data.winner === 'X' ? 'fa-circle' : 'fa-times'}" 
           style="color: ${data.winner === 'X' ? '#6dd5ed' : '#ff6a00'}; font-size: 3rem;"></i>
        <p>${winnerText}</p>
    `;
    
    // نمایش تاریخچه حرکات
    if (data.moves) {
        movesHistory.innerHTML = '<h3>تاریخچه حرکات:</h3>';
        data.moves.forEach((move, i) => {
            const moveElement = document.createElement('div');
            moveElement.className = 'move-item';
            moveElement.innerHTML = `
                <span>حرکت ${i + 1}:</span>
                <span>
                    <i class="fas ${move.player === 'X' ? 'fa-circle' : 'fa-times'}" 
                       style="color: ${move.player === 'X' ? '#6dd5ed' : '#ff6a00'};"></i>
                    خانه ${move.position + 1}
                </span>
            `;
            movesHistory.appendChild(moveElement);
        });
    }
    
    gameResults.classList.remove('hidden');
});

// بازی ریست شد
socket.on('gameReset', (data) => {
    updateBoard(data.board);
    myTurn = data.currentPlayer === currentSymbol;
    timers = data.timers;
    gameActive = true;
    
    if (myTurn) {
        playerX.classList.add('active');
        playerO.classList.remove('active');
    } else {
        playerX.classList.remove('active');
        playerO.classList.add('active');
    }
    
    movesCount.innerHTML = 'تعداد حرکت: 0';
    startTimers();
});

// حالت تماشاگر
socket.on('spectatorMode', (data) => {
    symbolSelection.classList.add('hidden');
    spectatorMode.classList.remove('hidden');
    statusDiv.innerHTML = '<i class="fas fa-eye"></i> در حال تماشا...';
    
    // ساخت برد تماشاگر
    if (data.games && data.games[0]) {
        const game = data.games[0];
        spectatorBoard.innerHTML = '<h3>برد بازی:</h3>';
        const miniBoard = document.createElement('div');
        miniBoard.className = 'board mini-board';
        miniBoard.style.gridTemplateColumns = 'repeat(3, 50px)';
        miniBoard.style.gap = '5px';
        
        game.board.forEach((cell, i) => {
            const cellDiv = document.createElement('div');
            cellDiv.style.cssText = `
                width: 50px;
                height: 50px;
                background: rgba(255,255,255,0.1);
                border: 2px solid rgba(255,255,255,0.2);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
            `;
            if (cell) {
                cellDiv.innerHTML = `<i class="fas ${cell === 'X' ? 'fa-circle' : 'fa-times'}" 
                                       style="color: ${cell === 'X' ? '#6dd5ed' : '#ff6a00'};"></i>`;
            }
            miniBoard.appendChild(cellDiv);
        });
        
        spectatorBoard.appendChild(miniBoard);
    }
});

// آپدیت برای تماشاگر
socket.on('gameUpdate', (data) => {
    if (data.winner) {
        statusDiv.innerHTML = `<i class="fas fa-trophy"></i> بازی تمام شد - برنده: ${data.winner === 'X' ? 'آبی' : 'قرمز'}`;
    }
    
    // آپدیت برد تماشاگر
    if (spectatorBoard.firstChild) {
        spectatorBoard.innerHTML = '<h3>برد بازی:</h3>';
        const miniBoard = document.createElement('div');
        miniBoard.className = 'board mini-board';
        miniBoard.style.gridTemplateColumns = 'repeat(3, 50px)';
        miniBoard.style.gap = '5px';
        
        data.board.forEach((cell, i) => {
            const cellDiv = document.createElement('div');
            cellDiv.style.cssText = `
                width: 50px;
                height: 50px;
                background: rgba(255,255,255,0.1);
                border: 2px solid rgba(255,255,255,0.2);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
            `;
            if (cell) {
                cellDiv.innerHTML = `<i class="fas ${cell === 'X' ? 'fa-circle' : 'fa-times'}" 
                                       style="color: ${cell === 'X' ? '#6dd5ed' : '#ff6a00'};"></i>`;
            }
            miniBoard.appendChild(cellDiv);
        });
        
        spectatorBoard.appendChild(miniBoard);
    }
});

// حریف رفت
socket.on('opponentLeft', () => {
    statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> حریف از بازی خارج شد!';
    gameActive = false;
    clearInterval(timerInterval);
    setTimeout(() => {
        location.reload();
    }, 3000);
});

// منتظر ماندن
socket.on('waiting', (message) => {
    statusDiv.innerHTML = `<i class="fas fa-hourglass-half"></i> ${message}`;
});

// ریست بازی
function resetGame() {
    if (currentGameId) {
        socket.emit('resetGame', currentGameId);
    }
}

// بستن نتایج
function closeResults() {
    gameResults.classList.add('hidden');
}

// تایمرها
function startTimers() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!gameActive) return;
        
        if (myTurn) {
            timers[currentSymbol] -= 1;
        }
        
        timerX.textContent = `${Math.max(0, timers.X)}s`;
        timerO.textContent = `${Math.max(0, timers.O)}s`;
        
        if (timers.X < 10) timerX.classList.add('warning');
        if (timers.O < 10) timerO.classList.add('warning');
        
        if (timers.X <= 0 || timers.O <= 0) {
            gameActive = false;
            clearInterval(timerInterval);
        }
    }, 1000);
}

// اتصال به سرور
socket.on('connect', () => {
    statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> متصل به سرور';
});

// قطع اتصال
socket.on('disconnect', () => {
    statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> قطع اتصال!';
    gameActive = false;
    clearInterval(timerInterval);
});

// صفحه اول
createBoard();