// ==========================================
//  SPINS — Client App
// ==========================================

const socket = io();
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.setHeaderColor('#09090b'); }

let user = tg?.initDataUnsafe?.user || { id: Math.floor(Math.random() * 100000), username: 'Guest', first_name: 'Guest' };
let currentBet = 100;
let userColor = '#8e8e93';
let userRank = 'Новичок';
let inventory = [];
let currentRoom = null;
let isSpinning = false;
let pvpWheelDone = false; // tracks if pvp wheel animation finished before game_over arrived

const RANKS = [
    { name: 'Новичок',  minBalance: 0,      color: '#8e8e93', icon: '🌱' },
    { name: 'Лудоман',  minBalance: 5000,   color: '#29b6f6', icon: '🎲' },
    { name: 'Инвестор', minBalance: 25000,  color: '#ffd700', icon: '💎' },
    { name: 'Шейх',     minBalance: 100000, color: '#ff2d55', icon: '👑' }
];

const STATUES = [
    { id: 'gold_durov',      name: 'Золотой Дуров',  rarity: 'rare',      emoji: '👑', bonus: 0.5 },
    { id: 'diamond_hamster', name: 'Алмазный Хомяк', rarity: 'epic',      emoji: '🐹', bonus: 1.0 },
    { id: 'prison_steve',    name: 'Тюремный Стив',  rarity: 'common',    emoji: '⛓️', bonus: 0.2 },
    { id: 'ton_king',        name: 'TON Король',      rarity: 'legendary', emoji: '⚡', bonus: 2.5 },
    { id: 'crypto_wolf',     name: 'Крипто Волк',     rarity: 'epic',      emoji: '🐺', bonus: 1.2 }
];

const RARITY_COLORS = {
    common: '#8e8e93', rare: '#007aff', epic: '#9d4edd', legendary: '#ffd700'
};

// ==========================================
//  INIT
// ==========================================
async function init() {
    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, username: user.username, first_name: user.first_name })
        });
        const dbUser = await res.json();
        userColor = dbUser.rankColor;
        userRank  = dbUser.rank;
        inventory = dbUser.inventory || [];
        updateBalance(dbUser.balance);
        updateUserInfo(dbUser);
        socket.emit('login', dbUser);
        drawBotWheel([], 0);
        if (user.id === 1743237033) document.body.style.boxShadow = 'inset 0 0 50px rgba(255,45,85,0.3)';
    } catch (e) {
        console.error('Init error:', e);
    }
}

function updateUserInfo(userData) {
    const rankIcon = RANKS.find(r => r.name === userData.rank)?.icon || '🌱';
    document.getElementById('username').innerHTML =
        `<span class="user-color-dot" style="background:${userData.rankColor}"></span>
         <span style="color:${userData.rankColor}">${rankIcon} ${userData.rank}</span>&nbsp;${userData.username || userData.firstName}`;
}

function updateBalance(amount) {
    document.getElementById('balance').innerText = Math.floor(amount).toLocaleString('ru');
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (amount >= RANKS[i].minBalance) {
            userRank = RANKS[i].name;
            userColor = RANKS[i].color;
            const ri = document.getElementById('rank-icon');
            if (ri) { ri.innerText = RANKS[i].icon; ri.style.color = RANKS[i].color; }
            break;
        }
    }
}

// ==========================================
//  BET
// ==========================================
function changeBet(val) {
    const bal = parseInt(document.getElementById('balance').innerText.replace(/\D/g, '')) || 0;
    let newBet = currentBet + val;
    if (newBet < 100) newBet = 100;
    if (newBet > bal) { showToast('Недостаточно средств!', 'error'); return; }
    currentBet = newBet;
    document.getElementById('currentBet').innerText = currentBet;
    document.getElementById('btnAmount').innerText  = currentBet;
}

// ==========================================
//  WHEEL DRAWING
// ==========================================
function drawWheelCanvas(canvasId, segments, rotationDeg = 0) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 8;
    const count = segments.length || 6;
    const slice = (2 * Math.PI) / count;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotationDeg * Math.PI / 180);

    for (let i = 0; i < count; i++) {
        const seg = segments[i] || { name: 'Bot', color: '#444' };
        const startA = i * slice;
        const endA   = (i + 1) * slice;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, startA, endA);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, startA, endA);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.rotate(startA + slice / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = `bold ${count > 6 ? 10 : 12}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.translate(radius * 0.65, 0);
        ctx.rotate(Math.PI / 2);
        const name = seg.name.length > 8 ? seg.name.slice(0, 7) + '…' : seg.name;
        ctx.fillText(name, 0, 0);
        ctx.restore();
    }

    // Center hub
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Fixed pointer arrow (not rotated with wheel)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx - 9, 2);
    ctx.lineTo(cx + 9, 2);
    ctx.lineTo(cx, 2 + 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function animateWheel(canvasId, segments, stopAngle, duration, callback) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const totalRotation = 1800 + stopAngle;
    const start = performance.now();

    function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);
        drawWheelCanvas(canvasId, segments, easeOut(progress) * totalRotation);
        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            drawWheelCanvas(canvasId, segments, totalRotation % 360);
            if (callback) callback();
        }
    }
    requestAnimationFrame(frame);
}

function drawBotWheel(segments, rotation) {
    const defaults = [
        { name: 'Alex',  color: '#FF2D55' }, { name: 'Maria', color: '#007AFF' },
        { name: 'John',  color: '#34C759' }, { name: 'Emma',  color: '#FF9500' },
        { name: 'Mike',  color: '#9D4EDD' }, { name: 'You',   color: '#8e8e93' }
    ];
    drawWheelCanvas('wheel', segments.length ? segments : defaults, rotation);
}

// ==========================================
//  BOT GAME
// ==========================================
document.getElementById('spinBtn').onclick = async () => {
    if (isSpinning) return;
    const btn = document.getElementById('spinBtn');
    btn.disabled = true;
    isSpinning = true;

    try {
        const res = await fetch('/api/bot-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, bet: currentBet })
        });
        const data = await res.json();

        if (data.error) { showToast(data.error, 'error'); btn.disabled = false; isSpinning = false; return; }

        // Show user's color indicator in header
        updateUserColorIndicator(data.userColor || data.participants[0]?.color || '#8e8e93');

        const segments = data.participants.map(p => ({ name: p.name, color: p.color }));
        drawBotWheel(segments, 0);

        animateWheel('wheel', segments, data.stopAngle, 5000, () => {
            updateBalance(data.newBalance);

            const winnerIdx = segments.findIndex(s => s.name === data.winner);
            if (winnerIdx >= 0) flashWinnerSegment('wheel', segments, winnerIdx, data.stopAngle);

            setTimeout(() => {
                showModal(data.isWin, data.pot, data.winner, data.winnerColor);
                if (data.droppedStatue) {
                    setTimeout(() => showStatueModal(data.droppedStatue), 800);
                }
                btn.disabled = false;
                isSpinning = false;
            }, 400);
        });
    } catch (e) {
        console.error(e);
        btn.disabled = false;
        isSpinning = false;
    }
};

function updateUserColorIndicator(color) {
    let dot = document.getElementById('userColorBadge');
    if (!dot) {
        dot = document.createElement('span');
        dot.id = 'userColorBadge';
        dot.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:50%;margin-left:6px;vertical-align:middle;border:2px solid rgba(255,255,255,0.3);transition:background 0.3s;`;
        document.querySelector('.balance-badge').appendChild(dot);
    }
    dot.style.background = color;
    dot.title = 'Ваш цвет на колесе';
}

function flashWinnerSegment(canvasId, segments, winnerIdx, finalAngle) {
    let blinks = 0;
    const finalRot = (1800 + finalAngle) % 360;
    const interval = setInterval(() => {
        const segs = segments.map((s, i) => ({
            ...s,
            color: i === winnerIdx ? (blinks % 2 === 0 ? '#ffffff' : segments[winnerIdx].color) : s.color
        }));
        drawWheelCanvas(canvasId, segs, finalRot);
        blinks++;
        if (blinks > 6) clearInterval(interval);
    }, 200);
}

// ==========================================
//  NAVIGATION
// ==========================================
function switchTab(tab) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const screen = document.getElementById(`screen-${tab}`);
    if (screen) screen.classList.add('active');
    const tabOrder = ['spins', 'pvp', 'market', 'profile'];
    const idx = tabOrder.indexOf(tab);
    document.querySelectorAll('.nav-item')[idx]?.classList.add('active');

    if (tab === 'pvp')     socket.emit('get_rooms');
    if (tab === 'market')  loadMarket();
    if (tab === 'profile') loadProfile();
}

// ==========================================
//  PVP — LOBBY ACTIONS
// ==========================================
function createRoom() {
    document.getElementById('createRoomModal').style.display = 'flex';
}

function confirmCreateRoom() {
    const bet = parseInt(document.getElementById('roomBetInput')?.value);
    if (!bet || bet < 100) { showToast('Минимальная ставка 100 TON', 'error'); return; }
    socket.emit('create_room', bet);
    document.getElementById('createRoomModal').style.display = 'none';
}

function joinRoom(id) {
    socket.emit('join_room', id);
}

function leaveRoom() {
    socket.emit('leave_room');
    switchTab('pvp');
}

function sendReady() {
    const btn = document.getElementById('readyBtn');
    // Disable immediately to prevent double-clicks
    btn.disabled = true;
    btn.innerText = '⏳ ОЖИДАНИЕ...';
    btn.style.background = 'linear-gradient(90deg, #34c759 0%, #2da44e 100%)';
    socket.emit('player_ready');
}

// ==========================================
//  SOCKET EVENTS
// ==========================================

socket.on('online_count', cnt => {
    const el = document.getElementById('onlineCount');
    if (el) el.innerText = cnt;
});

socket.on('update_rooms', (rooms) => {
    const list = document.getElementById('roomList');
    if (!list) return;
    if (!rooms.length) {
        list.innerHTML = '<div class="empty-rooms">Нет открытых комнат. Создайте свою!</div>';
        return;
    }
    list.innerHTML = rooms.map(r => `
        <div class="room-card" style="border-left:4px solid ${r.creatorColor||'#333'}">
            <div>
                <div class="room-creator">
                    <span class="color-dot" style="background:${r.creatorColor}"></span>
                    <span style="font-weight:bold">${r.creator}</span>
                    <span style="color:${getRankColor(r.creatorRank)};font-size:12px;margin-left:6px">${r.creatorRank}</span>
                </div>
                <div style="font-size:12px;color:#666;margin-top:4px">💰 Ставка: <b style="color:#fff">${r.bet} TON</b></div>
            </div>
            <button class="join-btn" onclick="joinRoom('${r.id}')">JOIN <span style="opacity:0.7">${r.players}/6</span></button>
        </div>
    `).join('');
});

// Fired when YOU join or create a room — switch to room screen
socket.on('room_joined', (room) => {
    currentRoom = room;
    pvpWheelDone = false;
    switchTab('room');
    renderRoom(room);
});

// Fired when the room state changes (someone else joins, marks ready, etc.)
socket.on('room_update', (room) => {
    currentRoom = room;
    // Only re-render if we're currently on the room screen
    if (document.getElementById('screen-room')?.classList.contains('active')) {
        renderRoom(room);
    }
});

socket.on('left_room', () => {
    currentRoom = null;
});

socket.on('error', (msg) => showToast(msg, 'error'));

// ── PvP GAME FLOW ──────────────────────────────────────────────────────────

// Pending game_over data — held until wheel animation completes
let _pendingGameOver = null;

socket.on('game_start', (data) => {
    _pendingGameOver = null;
    pvpWheelDone = false;

    const wc = document.getElementById('pvp-wheel-container');
    if (wc) wc.style.display = 'block';

    const segments = data.players.map(p => ({
        name: p.user.username,
        color: data.playerColors[p.user.telegramId] || p.user.color
    }));

    const statusEl = document.getElementById('roomStatus');
    if (statusEl) statusEl.innerHTML = `<span style="color:#ffd700;font-weight:bold">🎲 КРУТИМ! Банк: ${data.pot} TON</span>`;

    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) readyBtn.style.display = 'none';

    drawWheelCanvas('pvp-wheel', segments, 0);

    animateWheel('pvp-wheel', segments, data.stopAngle, 5500, () => {
        pvpWheelDone = true;
        // If game_over already arrived while wheel was spinning — show it now
        if (_pendingGameOver) {
            _showPvPResult(_pendingGameOver);
            _pendingGameOver = null;
        }
    });
});

socket.on('game_over', (data) => {
    if (!pvpWheelDone) {
        // Wheel still spinning — store and show after animation
        _pendingGameOver = data;
    } else {
        _showPvPResult(data);
    }
});

function _showPvPResult(data) {
    const isWin = String(data.winner.telegramId) === String(user.id);
    showModal(isWin, data.prize, data.winner.username, data.winner.color);

    setTimeout(() => {
        closeModal();
        switchTab('pvp');

        const wc = document.getElementById('pvp-wheel-container');
        if (wc) wc.style.display = 'none';

        const readyBtn = document.getElementById('readyBtn');
        if (readyBtn) {
            readyBtn.style.display  = 'block';
            readyBtn.innerText      = '✅ ГОТОВ';
            readyBtn.disabled       = false;
            readyBtn.style.background = '';
        }
        currentRoom = null;
    }, 4000);
}

socket.on('pvp_balance_update', (data) => {
    if (String(data.telegramId) === String(user.id)) updateBalance(data.newBalance);
});

socket.on('balance_update', (bal) => updateBalance(bal));

socket.on('balance_update_global', (data) => {
    if (String(data.telegramId) === String(user.id)) {
        updateBalance(data.newBalance);
        if (data.newRank) userRank = data.newRank;
    }
});

// ==========================================
//  RENDER ROOM
// ==========================================
function renderRoom(room) {
    document.getElementById('roomIdDisplay').innerHTML =
        `⚔️ Комната <span style="color:#007aff">#${room.id}</span>`;

    const grid = document.getElementById('playersGrid');
    grid.innerHTML = room.players.map(p => {
        const color = room.playerColors[p.user.telegramId] || p.user.color || '#8e8e93';
        const isMe  = String(p.user.telegramId) === String(user.id);
        return `
        <div class="player-avatar ${p.ready ? 'ready' : ''}"
             style="border-color:${p.ready ? '#34c759' : color};background:rgba(${hexToRgb(color)},${p.ready ? '0.12' : '0.06'})">
            <div style="font-size:28px">${p.user.telegramId == 1743237033 ? '👑' : '👤'}</div>
            <div class="player-name" style="color:${color}">${isMe ? '★ ' : ''}${p.user.username}</div>
            <div class="player-rank"  style="color:${getRankColor(p.user.rank)}">${p.user.rank}</div>
            <div class="player-status">${p.ready ? '✅ Готов' : '⏳'}</div>
        </div>`;
    }).join('');

    // Empty slots
    for (let i = room.players.length; i < 6; i++) {
        grid.innerHTML += `<div class="player-avatar empty"><div style="font-size:24px;opacity:0.2">+</div><div style="font-size:10px;opacity:0.3">Ожидание</div></div>`;
    }

    document.getElementById('roomStatus').innerHTML = `
        💰 Ставка: <b style="color:#fff">${room.bet} TON</b><br>
        Игроков: ${room.players.length}/6<br>
        <span style="color:#007aff;cursor:pointer;font-size:12px" onclick="copyRoomId('${room.id}')">📋 Скопировать ID: ${room.id}</span>
    `;

    // Sync ready button with player state (handles page re-renders)
    const myPlayer = room.players.find(p => String(p.user.telegramId) === String(user.id));
    const readyBtn  = document.getElementById('readyBtn');
    if (myPlayer?.ready) {
        readyBtn.innerText = '✅ ТЫ ГОТОВ';
        readyBtn.disabled  = true;
        readyBtn.style.background = 'linear-gradient(90deg,#34c759 0%,#2da44e 100%)';
    } else {
        // Only reset if game hasn't started
        if (room.status === 'waiting') {
            readyBtn.style.display = 'block';
            if (!readyBtn.disabled) {
                readyBtn.innerText = '✅ ГОТОВ';
                readyBtn.style.background = '';
            }
        }
    }
}

function copyRoomId(id) {
    navigator.clipboard?.writeText(id)
        .then(() => showToast('ID скопирован!', 'success'))
        .catch(()  => showToast(id, 'info'));
}

function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '255,255,255';
}

// ==========================================
//  MARKET
// ==========================================
async function loadMarket() {
    const marketList  = document.getElementById('marketList');
    const inventoryDiv = document.getElementById('userInventory');
    if (marketList) marketList.innerHTML = '<div class="loading">Загрузка...</div>';

    try {
        const res   = await fetch('/api/market');
        const items = await res.json();

        if (marketList) {
            if (!items.length) {
                marketList.innerHTML = '<div class="empty-market">Рынок пуст. Выбейте статуи в игре!</div>';
            } else {
                marketList.innerHTML = items.map(item => `
                    <div class="market-item">
                        <div class="market-item-info">
                            <span class="statue-emoji">${item.statue.emoji}</span>
                            <div>
                                <div class="statue-name">${item.statue.name}</div>
                                <div class="statue-rarity" style="color:${RARITY_COLORS[item.statue.rarity]}">${item.statue.rarity.toUpperCase()}</div>
                                <div class="statue-seller">от ${item.sellerName} · x${item.count}</div>
                                <div class="statue-bonus">+${item.statue.bonus}% к выигрышам</div>
                            </div>
                        </div>
                        <div class="market-item-buy">
                            <div class="market-price">${item.price} TON</div>
                            ${item.sellerId != user.id
                                ? `<button class="buy-btn" onclick="buyItem('${item.sellerId}','${item.statue.id}',${item.price})">Купить</button>`
                                : `<span style="color:#666;font-size:11px">Ваш</span>`}
                        </div>
                    </div>
                `).join('');
            }
        }

        if (inventoryDiv) {
            if (!inventory.length) {
                inventoryDiv.innerHTML = `
                    <div class="inventory-empty">
                        <div style="font-size:32px;margin-bottom:8px">🗃️</div>
                        <div>Инвентарь пуст</div>
                        <div style="font-size:12px;color:#666;margin-top:4px">Выбейте статуи при спине (шанс 5%)</div>
                    </div>`;
            } else {
                inventoryDiv.innerHTML = '<div class="inv-title">📦 Ваши статуи</div>' +
                    inventory.map(item => {
                        const s = STATUES.find(st => st.id === item.statueId);
                        return s ? `<div class="inventory-item">
                            <span>${s.emoji} <span style="color:${RARITY_COLORS[s.rarity]}">${s.name}</span></span>
                            <span class="inv-count">x${item.count}</span>
                        </div>` : '';
                    }).join('');
            }
        }
    } catch {
        if (marketList) marketList.innerHTML = '<div style="color:#ff3b30">Ошибка загрузки</div>';
    }
}

async function buyItem(sellerId, statueId, price) {
    if (!confirm(`Купить за ${price} TON?`)) return;
    try {
        const res  = await fetch('/api/market/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buyerId: user.id, sellerId: parseInt(sellerId), statueId, price })
        });
        const data = await res.json();
        if (data.success) { updateBalance(data.newBalance); showToast('✅ Куплено!', 'success'); loadMarket(); }
        else showToast(data.error, 'error');
    } catch { showToast('Ошибка покупки', 'error'); }
}

// ==========================================
//  PROFILE
// ==========================================
async function loadProfile() {
    const el = document.getElementById('profileInfo');
    if (!el) return;
    el.innerHTML = '<div class="loading">Загрузка профиля...</div>';

    try {
        const res      = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id }) });
        const userData = await res.json();
        const rank     = RANKS.find(r => r.name === userData.rank) || RANKS[0];
        const winRate  = userData.stats.games ? ((userData.stats.wins / userData.stats.games) * 100).toFixed(1) : 0;

        el.innerHTML = `
            <div class="profile-header">
                <div class="profile-rank-icon" style="color:${rank.color}">${rank.icon}</div>
                <div class="profile-name">${userData.username || userData.firstName}</div>
                <div class="profile-rank-badge" style="background:${rank.color}22;color:${rank.color};border:1px solid ${rank.color}44">${rank.name}</div>
                <div class="profile-id">ID: ${userData.telegramId}</div>
            </div>
            <div class="profile-stats">
                <div class="stat-row"><span class="stat-label">💎 Баланс</span><span class="stat-value" style="color:#29b6f6">${Math.floor(userData.balance).toLocaleString('ru')} TON</span></div>
                <div class="stat-row"><span class="stat-label">🎮 Игр сыграно</span><span class="stat-value">${userData.stats.games}</span></div>
                <div class="stat-row"><span class="stat-label">🏆 Побед</span><span class="stat-value" style="color:#34c759">${userData.stats.wins}</span></div>
                <div class="stat-row"><span class="stat-label">📊 Винрейт</span><span class="stat-value" style="color:${winRate>=40?'#34c759':'#ff3b30'}">${winRate}%</span></div>
                <div class="stat-row"><span class="stat-label">💰 Всего выиграно</span><span class="stat-value" style="color:#ffd700">${Math.floor(userData.stats.totalWon).toLocaleString('ru')} TON</span></div>
                <div class="stat-row"><span class="stat-label">📦 Статуй</span><span class="stat-value">${userData.inventory?.length || 0}</span></div>
                <div class="stat-row"><span class="stat-label">🗓️ Регистрация</span><span class="stat-value" style="font-size:12px">${new Date(userData.createdAt).toLocaleDateString('ru-RU')}</span></div>
            </div>
            <h3 class="section-title">📜 Последние игры</h3>
            <div class="last-games">
                ${(userData.stats.lastGames?.slice().reverse() || []).map(g => `
                    <div class="game-item ${g.result}">
                        <div style="display:flex;align-items:center;gap:8px">
                            <span>${g.type==='bot'?'🤖':'⚔️'}</span>
                            <span>${g.type==='bot'?'Боты':'PvP'}</span>
                            <span style="font-size:11px;color:#555">${new Date(g.date).toLocaleDateString('ru-RU')}</span>
                        </div>
                        <span style="color:${g.result==='win'?'#34c759':'#ff3b30'};font-weight:bold">${g.result==='win'?'+':''}${g.amount} TON</span>
                    </div>
                `).join('') || '<div style="color:#555;padding:10px">Нет игр</div>'}
            </div>`;
    } catch {
        el.innerHTML = '<div style="color:#ff3b30">Ошибка загрузки профиля</div>';
    }
}

// ==========================================
//  MODALS
// ==========================================
function showModal(isWin, amount, winnerName, winnerColor = '#007aff') {
    const m = document.getElementById('resultModal');
    m.style.display = 'flex';
    document.getElementById('modalTitle').innerText  = isWin ? '🏆 ТЫ ПОБЕДИЛ!' : '💀 ТЫ ПРОИГРАЛ';
    document.getElementById('modalTitle').style.color = isWin ? '#34c759' : '#ff3b30';
    document.getElementById('modalAmount').innerHTML  = `${isWin ? '+' : ''}${Math.floor(amount)} TON`;
    document.getElementById('modalAmount').style.color = isWin ? '#34c759' : '#ff3b30';
    document.getElementById('modalMsg').innerHTML = isWin
        ? '🎉 Отличная игра!'
        : `Победитель: <span style="color:${winnerColor};font-weight:bold">${winnerName}</span>`;
    m.querySelector('.modal').style.boxShadow = isWin
        ? '0 0 40px rgba(52,199,89,0.4)'
        : '0 0 40px rgba(255,59,48,0.3)';
}

function showStatueModal(statue) {
    const m = document.getElementById('statueModal');
    document.getElementById('statueEmoji').innerText = statue.emoji;
    document.getElementById('statueName').innerText  = statue.name;
    document.getElementById('statueRarity').innerHTML = `<span style="color:${RARITY_COLORS[statue.rarity]}">${statue.rarity.toUpperCase()}</span>`;
    document.getElementById('statueBonus').innerText  = `+${statue.bonus}% к каждому выигрышу`;
    m.style.display = 'flex';
    const existing = inventory.find(i => i.statueId === statue.id);
    if (existing) existing.count++; else inventory.push({ statueId: statue.id, count: 1 });
}

function closeModal() {
    document.getElementById('resultModal').style.display   = 'none';
    document.getElementById('statueModal').style.display   = 'none';
    document.getElementById('createRoomModal').style.display = 'none';
}

// ==========================================
//  TOAST
// ==========================================
function showToast(msg, type = 'info') {
    document.getElementById('toast')?.remove();
    const t = document.createElement('div');
    t.id = 'toast';
    const c = { success:'#34c759', error:'#ff3b30', info:'#007aff' };
    t.style.cssText = `position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:${c[type]};color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;font-weight:600;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,0.4);pointer-events:none;animation:fadeIn 0.2s ease;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

// ==========================================
//  HELPERS
// ==========================================
function getRankColor(rank) {
    return RANKS.find(r => r.name === rank)?.color || '#8e8e93';
}

// ==========================================
//  START
// ==========================================
init();
