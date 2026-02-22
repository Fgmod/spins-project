const socket = io();
const tg = window.Telegram.WebApp;
tg.expand();

let user = tg.initDataUnsafe?.user || { id: Math.floor(Math.random()*100000), username: 'Guest', first_name: 'Guest' };
let currentBet = 100;
let userColor = '#8e8e93';
let userRank = 'Новичок';
let inventory = [];
let currentRoom = null;

const RANKS = [
    { name: 'Новичок', minBalance: 0, color: '#8e8e93', icon: '🌱' },
    { name: 'Лудоман', minBalance: 5000, color: '#29b6f6', icon: '🎲' },
    { name: 'Инвестор', minBalance: 25000, color: '#ffd700', icon: '💎' },
    { name: 'Шейх', minBalance: 100000, color: '#ff2d55', icon: '👑' }
];

const BOT_NAMES = ['Alex', 'Maria', 'John', 'Emma', 'Mike', 'Sarah'];
const BOT_COLORS = ['#FF2D55', '#007AFF', '#34C759', '#FF9500', '#9D4EDD', '#FFD700'];

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
    
    userColor = dbUser.rankColor;
    userRank = dbUser.rank;
    inventory = dbUser.inventory || [];
    
    updateBalance(dbUser.balance);
    updateUserInfo(dbUser);
    
    socket.emit('login', dbUser);
    drawWheel();
    
    // Если админ - показываем особый эффект
    if (user.id === 1743237033) {
        document.body.style.boxShadow = 'inset 0 0 50px rgba(255, 45, 85, 0.3)';
    }
}

function updateUserInfo(userData) {
    document.getElementById('username').innerHTML = `
        <span style="color: ${userData.rankColor}">${userData.rank}</span> 
        ${userData.username || userData.firstName}
    `;
}

function updateBalance(amount) {
    document.getElementById('balance').innerText = amount;
    
    // Обновляем ранг на основе баланса
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (amount >= RANKS[i].minBalance) {
            userRank = RANKS[i].name;
            userColor = RANKS[i].color;
            document.getElementById('rank-icon').innerText = RANKS[i].icon;
            document.getElementById('rank-icon').style.color = RANKS[i].color;
            break;
        }
    }
}

function changeBet(val) {
    let newBet = currentBet + val;
    if (newBet < 100) newBet = 100;
    if (newBet > parseFloat(document.getElementById('balance').innerText)) {
        alert('Недостаточно средств!');
        return;
    }
    currentBet = newBet;
    document.getElementById('currentBet').innerText = currentBet;
    document.getElementById('btnAmount').innerText = currentBet;
}

// --- КОЛЕСО ---
function drawWheel(rotation = 0, segments = []) {
    const canvas = document.getElementById('wheel');
    const ctx = canvas.getContext('2d');
    const colors = segments.length ? segments.map(s => s.color) : BOT_COLORS;
    const names = segments.length ? segments.map(s => s.name) : BOT_NAMES;
    
    const slice = (2 * Math.PI) / (segments.length || 6);
    
    ctx.clearRect(0, 0, 300, 300);
    ctx.save();
    ctx.translate(150, 150);
    ctx.rotate(rotation * Math.PI / 180);

    for (let i = 0; i < (segments.length || 6); i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 140, i * slice, (i + 1) * slice);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        
        ctx.save();
        ctx.rotate(i * slice + slice/2);
        ctx.fillStyle = "white";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(names[i % names.length] || "Bot", 0, -80);
        ctx.restore();
    }
    ctx.restore();
}

function spinWheelAnimation(stopAngle, segments, callback) {
    const canvas = document.getElementById('wheel');
    const finalRot = 1800 + stopAngle;
    
    drawWheel(0, segments);
    canvas.style.transform = `rotate(${finalRot}deg)`;
    
    setTimeout(() => {
        canvas.style.transition = 'none';
        canvas.style.transform = `rotate(${stopAngle}deg)`;
        setTimeout(() => canvas.style.transition = 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)', 50);
        drawWheel(stopAngle, segments);
        callback();
    }, 4000);
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

    const segments = data.participants.map(p => ({
        name: p.name,
        color: p.color
    }));

    spinWheelAnimation(data.stopAngle, segments, () => {
        updateBalance(data.newBalance);
        showModal(data.isWin, data.pot, data.winner, data.winnerColor);
        
        if (data.droppedStatue) {
            setTimeout(() => {
                showStatueModal(data.droppedStatue);
            }, 1000);
        }
        
        btn.disabled = false;
    });
};

// --- PVP ФУНКЦИИ ---
function switchTab(tab) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`screen-${tab}`).classList.add('active');
    
    if (tab === 'pvp') {
        socket.emit('get_rooms');
        loadMarket();
    }
}

function createRoom() {
    const bet = prompt('Введите ставку (минимум 100 TON):', '1000');
    if (bet && !isNaN(bet) && parseInt(bet) >= 100) {
        socket.emit('create_room', parseInt(bet));
    }
}

function joinRoom(id) {
    socket.emit('join_room', id);
}

function leaveRoom() {
    socket.emit('leave_room');
    switchTab('pvp');
}

function sendReady() {
    socket.emit('player_ready');
    document.getElementById('readyBtn').innerText = "WAITING...";
    document.getElementById('readyBtn').disabled = true;
}

// --- МАРКЕТ (КОЛЛЕКЦИИ) ---
async function loadMarket() {
    const res = await fetch('/api/market');
    const items = await res.json();
    
    const marketList = document.getElementById('marketList');
    if (marketList) {
        marketList.innerHTML = items.map(item => `
            <div class="market-item">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:24px;">${item.statue.emoji}</span>
                    <div>
                        <div style="font-weight:bold;">${item.statue.name}</div>
                        <div style="font-size:12px; color:#666;">Редкость: ${item.statue.rarity}</div>
                        <div style="font-size:12px; color:#666;">Продавец: ${item.sellerName}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; color:#007aff;">${item.price} TON</div>
                    <button onclick="buyItem('${item.sellerId}', '${item.statue.id}', ${item.price})" 
                            style="margin-top:5px; padding:5px 10px; background:#007aff; border:none; border-radius:8px; color:white;">
                        Купить
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    // Отображаем инвентарь
    const inventoryDiv = document.getElementById('userInventory');
    if (inventoryDiv && inventory.length) {
        inventoryDiv.innerHTML = '<h4>Ваши статуи:</h4>' + inventory.map(item => {
            const statue = STATUES.find(s => s.id === item.statueId);
            return `
                <div class="inventory-item">
                    <span>${statue?.emoji} ${statue?.name}</span>
                    <span>x${item.count}</span>
                </div>
            `;
        }).join('');
    }
}

async function buyItem(sellerId, statueId, price) {
    if (!confirm(`Купить за ${price} TON?`)) return;
    
    const res = await fetch('/api/market/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            buyerId: user.id,
            sellerId: parseInt(sellerId),
            statueId,
            price
        })
    });
    
    const data = await res.json();
    if (data.success) {
        updateBalance(data.newBalance);
        loadMarket();
        alert('Покупка успешна!');
    } else {
        alert(data.error);
    }
}

// --- ПРОФИЛЬ ---
async function loadProfile() {
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id })
    });
    const userData = await res.json();
    
    document.getElementById('profileInfo').innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <div style="font-size:48px; color:${userData.rankColor}">${RANKS.find(r => r.name === userData.rank)?.icon}</div>
            <h2 style="color:${userData.rankColor}">${userData.rank}</h2>
        </div>
        <div class="profile-stats">
            <div>ID: <span>${userData.telegramId}</span></div>
            <div>Баланс: <span>${userData.balance} TON</span></div>
            <div>Игр сыграно: <span>${userData.stats.games}</span></div>
            <div>Побед: <span>${userData.stats.wins}</span></div>
            <div>Процент побед: <span>${userData.stats.games ? ((userData.stats.wins / userData.stats.games) * 100).toFixed(1) : 0}%</span></div>
            <div>Всего выиграно: <span>${userData.stats.totalWon} TON</span></div>
        </div>
        <h3>Последние игры:</h3>
        <div class="last-games">
            ${userData.stats.lastGames?.slice().reverse().map(game => `
                <div class="game-item ${game.result}">
                    <span>${game.type === 'bot' ? '🤖' : '⚔️'} ${game.type === 'bot' ? 'Против ботов' : 'PvP'}</span>
                    <span style="color: ${game.result === 'win' ? '#34c759' : '#ff3b30'}">
                        ${game.result === 'win' ? '+' : ''}${game.amount} TON
                    </span>
                </div>
            `).join('') || 'Нет игр'}
        </div>
    `;
}

// --- SOCKET EVENTS ---
socket.on('online_count', cnt => document.getElementById('onlineCount').innerText = cnt);

socket.on('update_rooms', (rooms) => {
    const list = document.getElementById('roomList');
    list.innerHTML = rooms.map(r => `
        <div class="room-card" style="border-left: 4px solid ${getRankColor(r.creatorRank)}">
            <div>
                <div style="font-weight:bold;">${r.creator}</div>
                <div style="font-size:12px; color:#666;">Ранг: ${r.creatorRank}</div>
                <div style="font-size:12px; color:#666;">Ставка: ${r.bet} TON</div>
            </div>
            <button class="bet-btn" style="width:auto; padding:5px 15px; border-radius:8px; background:#007aff;" onclick="joinRoom('${r.id}')">
                JOIN (${r.players}/6)
            </button>
        </div>
    `).join('');
});

socket.on('room_joined', (room) => {
    currentRoom = room;
    switchTab('room');
    renderRoom(room);
});

socket.on('room_update', (room) => {
    currentRoom = room;
    renderRoom(room);
});

socket.on('left_room', () => {
    currentRoom = null;
});

function renderRoom(room) {
    document.getElementById('roomIdDisplay').innerHTML = `
        Комната #${room.id} 
        <span style="color:${userColor}; font-size:14px;">${userRank}</span>
    `;
    
    const grid = document.getElementById('playersGrid');
    
    grid.innerHTML = room.players.map(p => `
        <div class="player-avatar ${p.ready ? 'ready' : ''}" 
             style="border-color: ${room.playerColors[p.user.telegramId] || p.user.color}">
            <div style="font-size:24px; color: ${room.playerColors[p.user.telegramId] || p.user.color}">
                ${p.user.telegramId === 1743237033 ? '👑' : '👤'}
            </div>
            <div style="font-size:10px; margin-top:5px; color: ${room.playerColors[p.user.telegramId] || p.user.color}">
                ${p.user.username}
            </div>
            <div style="font-size:8px;">${p.user.rank || 'Новичок'}</div>
        </div>
    `).join('');

    document.getElementById('roomStatus').innerHTML = `
        Ставка: ${room.bet} TON<br>
        <span style="color:#007aff; cursor:pointer;" onclick="navigator.clipboard.writeText('${room.id}'); alert('ID скопирован!')">
            📋 Скопировать ID
        </span>
    `;
}

socket.on('game_start', (data) => {
    const wheelContainer = document.getElementById('pvp-wheel-container');
    if (wheelContainer) {
        wheelContainer.style.display = 'block';
        
        const segments = data.players.map(p => ({
            name: p.user.username,
            color: data.playerColors[p.user.telegramId] || p.user.color
        }));
        
        drawWheel(0, segments);
        
        document.getElementById('roomStatus').innerHTML = `
            <span style="color:#007aff;">🎲 КРУТИМ! ПОТ: ${data.pot} TON</span>
        `;
    }
});

socket.on('game_over', (data) => {
    showModal(
        data.winner.telegramId == user.id, 
        data.prize, 
        data.winner.username,
        data.winner.color
    );
    
    setTimeout(() => {
        switchTab('pvp');
        document.getElementById('pvp-wheel-container').style.display = 'none';
    }, 3000);
});

socket.on('balance_update', (bal) => {
    updateBalance(bal);
});

socket.on('balance_update_global', (data) => {
    if (data.telegramId === user.id) {
        updateBalance(data.newBalance);
        if (data.newRank) {
            userRank = data.newRank;
            document.getElementById('username').innerHTML = `
                <span style="color: ${data.newColor || userColor}">${data.newRank}</span> 
                ${user.username}
            `;
        }
    }
});

// --- UI HELPERS ---
function showModal(isWin, amount, winnerName, winnerColor = '#007aff') {
    const m = document.getElementById('resultModal');
    m.style.display = 'flex';
    document.getElementById('modalTitle').innerText = isWin ? "ТЫ ПОБЕДИЛ!" : "ТЫ ПРОИГРАЛ";
    document.getElementById('modalTitle').style.color = isWin ? "#34c759" : "#ff3b30";
    document.getElementById('modalAmount').innerHTML = (isWin ? "+" : "") + amount + " TON";
    document.getElementById('modalAmount').style.color = isWin ? "#34c759" : "#ff3b30";
    document.getElementById('modalMsg').innerHTML = isWin ? "Отличная работа!" : `Победитель: <span style="color:${winnerColor}">${winnerName}</span>`;
}

function showStatueModal(statue) {
    const m = document.getElementById('statueModal');
    document.getElementById('statueName').innerText = statue.name;
    document.getElementById('statueRarity').innerText = statue.rarity;
    document.getElementById('statueBonus').innerText = `+${statue.bonus}% к выигрышам`;
    m.style.display = 'flex';
}

function closeModal() {
    document.getElementById('resultModal').style.display = 'none';
    document.getElementById('statueModal').style.display = 'none';
}

function getRankColor(rank) {
    const r = RANKS.find(r => r.name === rank);
    return r ? r.color : '#8e8e93';
}

init();
