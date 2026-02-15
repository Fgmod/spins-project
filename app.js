const socket = io();
const tg = window.Telegram.WebApp;
tg.expand();

// Данные пользователя (симуляция для браузера, если не в ТГ)
let user = tg.initDataUnsafe?.user || { id: Math.floor(Math.random()*100000), username: 'Guest', first_name: 'Guest' };
let currentBet = 100;

// --- ИНИЦИАЛИЗАЦИЯ ---
async function init() {
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id: user.id, 
            username: user.username,
            first_name: user.first_name 
        })
    });
    const dbUser = await res.json();
    updateBalance(dbUser.balance);
    document.getElementById('username').innerText = dbUser.username || dbUser.firstName;

    // Подключение к сокету
    socket.emit('login', dbUser);
    drawWheel();
}

function updateBalance(amount) {
    document.getElementById('balance').innerText = amount;
}

// --- УПРАВЛЕНИЕ СТАВКАМИ ---
function changeBet(val) {
    let newBet = currentBet + val;
    if (newBet < 100) newBet = 100;
    currentBet = newBet;
    document.getElementById('currentBet').innerText = currentBet;
    document.getElementById('btnAmount').innerText = currentBet;
}

// --- ИГРА С БОТАМИ ---
document.getElementById('spinBtn').onclick = async () => {
    const btn = document.getElementById('spinBtn');
    btn.disabled = true;

    const res = await fetch('/api/bot-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, bet: currentBet })
    });
    const data = await res.json();
    
    if (data.error) {
        alert(data.error);
        btn.disabled = false;
        return;
    }

    // Анимация вращения
    spinWheelAnimation(data.stopAngle, () => {
        updateBalance(data.newBalance);
        showModal(data.isWin, data.pot, data.winner);
        btn.disabled = false;
    });
};

// --- КОЛЕСО (CANVAS) ---
function drawWheel(rotation = 0) {
    const canvas = document.getElementById('wheel');
    const ctx = canvas.getContext('2d');
    const colors = ['#FFD700', '#FF2D55', '#007AFF', '#9D4EDD', '#34C759', '#FF9500'];
    const slice = (2 * Math.PI) / 6;
    
    ctx.clearRect(0,0,300,300);
    ctx.save();
    ctx.translate(150, 150);
    ctx.rotate(rotation * Math.PI / 180);

    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 140, i * slice, (i + 1) * slice);
        ctx.fillStyle = colors[i];
        ctx.fill();
        // Добавим иконки или текст
        ctx.fillStyle = "white";
        ctx.font = "bold 16px Arial";
        ctx.fillText("x4", 80 * Math.cos(i * slice + slice/2), 80 * Math.sin(i * slice + slice/2));
    }
    ctx.restore();
}

function spinWheelAnimation(stopAngle, callback) {
    const canvas = document.getElementById('wheel');
    // 5 полных оборотов + угол сервера
    const finalRot = 1800 + stopAngle; 
    canvas.style.transform = `rotate(${finalRot}deg)`;
    
    setTimeout(() => {
        canvas.style.transition = 'none';
        canvas.style.transform = `rotate(${stopAngle}deg)`;
        // Вернуть анимацию для следующего раза
        setTimeout(() => canvas.style.transition = 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)', 50);
        callback();
    }, 4000);
}

// --- PVP ФУНКЦИИ ---
function switchTab(tab) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`screen-${tab}`).classList.add('active');
    if (tab === 'pvp') socket.emit('get_rooms');
}

function createRoom() {
    socket.emit('create_room', 1000); // Фикс ставка для примера
}

function joinRoom(id) {
    socket.emit('join_room', id);
}

function sendReady() {
    socket.emit('player_ready');
    document.getElementById('readyBtn').innerText = "WAITING...";
    document.getElementById('readyBtn').disabled = true;
}

// --- SOCKET EVENTS ---
socket.on('online_count', cnt => document.getElementById('onlineCount').innerText = cnt);

socket.on('update_rooms', (rooms) => {
    const list = document.getElementById('roomList');
    list.innerHTML = rooms.map(r => `
        <div class="room-card">
            <div>
                <div style="font-weight:bold;">Room by ${r.creator}</div>
                <div style="font-size:12px; color:#666;">Bet: ${r.bet} TON</div>
            </div>
            <button class="bet-btn" style="width:auto; padding:5px 15px; border-radius:8px; background:#007aff;" onclick="joinRoom('${r.id}')">
                JOIN (${r.players}/6)
            </button>
        </div>
    `).join('');
});

socket.on('room_joined', (room) => {
    switchTab('room'); // Переключиться на экран комнаты
    renderRoom(room);
});

socket.on('room_update', (room) => renderRoom(room));

function renderRoom(room) {
    document.getElementById('roomIdDisplay').innerText = `Room #${room.id}`;
    const grid = document.getElementById('playersGrid');
    
    grid.innerHTML = room.players.map(p => `
        <div class="player-avatar ${p.ready ? 'ready' : ''}">
            <div style="font-size:24px;">👤</div>
            <div style="font-size:10px; margin-top:5px;">${p.user.username}</div>
        </div>
    `).join('');

    // Кнопка приглашения
    document.getElementById('roomStatus').innerHTML = `
        Waiting for bets...<br>
        <span style="color:#007aff; cursor:pointer;" onclick="navigator.clipboard.writeText('${room.id}'); alert('Copied!')">
            Copy Room ID to Invite
        </span>
    `;
}

socket.on('balance_update', bal => updateBalance(bal));

socket.on('game_start', (data) => {
    document.getElementById('roomStatus').innerText = `SPINNING! POT: ${data.pot}`;
    // Здесь можно добавить анимацию PvP рулетки
});

socket.on('game_over', (data) => {
    showModal(data.winner.telegramId == user.id, data.prize, data.winner.username);
    setTimeout(() => switchTab('pvp'), 3000); // Выход в лобби через 3 сек
});

// --- UI HELPERS ---
function showModal(isWin, amount, winnerName) {
    const m = document.getElementById('resultModal');
    m.style.display = 'flex';
    document.getElementById('modalTitle').innerText = isWin ? "YOU WON!" : "YOU LOST";
    document.getElementById('modalTitle').style.color = isWin ? "#34c759" : "#ff3b30";
    document.getElementById('modalAmount').innerText = (isWin ? "+" : "") + amount + " TON";
    document.getElementById('modalMsg').innerText = isWin ? "Great job!" : `Winner: ${winnerName}`;
}

function closeModal() {
    document.getElementById('resultModal').style.display = 'none';
}

init();
