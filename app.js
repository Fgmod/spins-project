// ==========================================
//  SPINS — Client v4.0
// ==========================================

const socket = io();
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.setHeaderColor?.('#0f0f0f'); }

let user = tg?.initDataUnsafe?.user || { id: Math.floor(Math.random() * 100000), username: 'Guest', first_name: 'Guest' };
let balance = 0;
let inventory = [];
let selectedBetGiftId = null;
let isSpinning = false;
let currentRoom = null;
let pvpWheelDone = false;
let _pendingGameOver = null;

// Gift awaiting user decision (keep/sell)
let pendingGift = null;

// Gifts data from server
let GIFTS = [];

// Rooms create modal state
let createRoomGiftId = null;
let createRoomMaxPlayers = 6;

// Sell modal state
let sellGiftId = null;

const RARITY_COLORS = {
    common: '#8e8e93', rare: '#3b9ede', epic: '#af52de', legendary: '#ffd60a'
};

const RARITY_NAMES = {
    common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный'
};

const RANKS = [
    { name: 'Новичок',  minBalance: 0,      color: '#8e8e93', icon: '🌱' },
    { name: 'Игрок',    minBalance: 2000,   color: '#29b6f6', icon: '🎮' },
    { name: 'Лудоман',  minBalance: 10000,  color: '#ff9500', icon: '🎲' },
    { name: 'Инвестор', minBalance: 50000,  color: '#ffd700', icon: '💎' },
    { name: 'Шейх',     minBalance: 200000, color: '#ff2d55', icon: '👑' }
];

// ==========================================
//  INIT
// ==========================================
async function init() {
    try {
        // Load gifts list
        const giftsRes = await fetch('/api/gifts');
        GIFTS = await giftsRes.json();

        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, username: user.username, first_name: user.first_name })
        });
        const dbUser = await res.json();
        balance = dbUser.balance;
        inventory = dbUser.inventory || [];

        updateBalance(dbUser.balance);
        updateUserDisplay(dbUser);

        socket.emit('login', dbUser);

        drawDefaultWheel();
        renderGiftBetList();
    } catch (e) {
        console.error('Init error:', e);
        showToast('Ошибка подключения', 'error');
    }
}

function updateUserDisplay(userData) {
    const rank = RANKS.find(r => r.name === userData.rank) || RANKS[0];
    const nameEl = document.getElementById('username-display');
    if (nameEl) {
        nameEl.innerHTML = `<span style="color:${rank.color}">${rank.icon}</span> ${userData.username || userData.firstName || 'Player'}`;
    }
}

function updateBalance(amount) {
    balance = amount;
    const el = document.getElementById('balance');
    if (el) el.textContent = Math.floor(amount).toLocaleString('ru');

    const casesEl = document.getElementById('casesBalance');
    if (casesEl) casesEl.textContent = Math.floor(amount).toLocaleString('ru');
}

function updateInventory(newInventory) {
    inventory = newInventory || [];
    renderGiftBetList();
}

// ==========================================
//  WHEEL
// ==========================================
function drawWheelCanvas(canvasId, segments, rotationDeg = 0) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 6;
    const count = segments.length || 6;
    const slice = (2 * Math.PI) / count;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotationDeg * Math.PI / 180);

    const PALETTE = ['#FF2D55','#007AFF','#34C759','#FF9500','#AF52DE','#FFD60A','#FF6B6B','#4ECDC4'];

    for (let i = 0; i < count; i++) {
        const seg = segments[i] || {};
        const startA = i * slice;
        const endA   = (i + 1) * slice;
        const color  = seg.color || PALETTE[i % PALETTE.length];

        // Segment
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, startA, endA);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Emoji or text
        ctx.save();
        ctx.rotate(startA + slice / 2);
        ctx.translate(radius * 0.62, 0);
        ctx.rotate(Math.PI / 2);

        if (seg.emoji) {
            ctx.font = `${count > 6 ? 14 : 18}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(seg.emoji, 0, 0);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = `bold ${count > 6 ? 9 : 11}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            const name = (seg.name || '?').length > 7 ? (seg.name || '?').slice(0,6)+'…' : (seg.name || '?');
            ctx.fillText(name, 0, 0);
        }
        ctx.restore();
    }

    // Center hub
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, 2 * Math.PI);
    const hubGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 20);
    hubGrad.addColorStop(0, '#3a3a3c');
    hubGrad.addColorStop(1, '#1c1c1e');
    ctx.fillStyle = hubGrad;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
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
        if (progress < 1) requestAnimationFrame(frame);
        else { drawWheelCanvas(canvasId, segments, totalRotation % 360); if (callback) callback(); }
    }
    requestAnimationFrame(frame);
}

function drawDefaultWheel() {
    const defaults = [
        { name: 'Alex',  color: '#FF2D55', emoji: '🎮' },
        { name: 'Maria', color: '#007AFF', emoji: '🎭' },
        { name: 'John',  color: '#34C759', emoji: '🃏' },
        { name: 'Emma',  color: '#FF9500', emoji: '🎯' },
        { name: 'Mike',  color: '#AF52DE', emoji: '🎲' },
        { name: 'You',   color: '#3b9ede', emoji: '⭐' }
    ];
    drawWheelCanvas('wheel', defaults, 0);
}

// ==========================================
//  GIFT BET LIST (Spins screen)
// ==========================================
function renderGiftBetList() {
    const container = document.getElementById('giftBetList');
    if (!container) return;

    const available = inventory.filter(item => {
        const avail = item.count - (item.listedInMarket || 0);
        return avail > 0;
    });

    if (!available.length) {
        container.innerHTML = '<div class="empty-hint">Нет подарков. Откройте кейс!</div>';
        selectedBetGiftId = null;
        updateSpinBtn();
        return;
    }

    container.innerHTML = available.map(item => {
        const gift = GIFTS.find(g => g.id === item.statueId);
        if (!gift) return '';
        const avail = item.count - (item.listedInMarket || 0);
        const sel = selectedBetGiftId === gift.id ? 'selected' : '';
        return `
        <div class="gift-bet-item ${sel}" onclick="selectBetGift('${gift.id}')">
            <span class="gift-em">${gift.emoji}</span>
            <div class="gift-nm">${gift.name}</div>
            <div class="gift-cnt">x${avail}</div>
        </div>`;
    }).join('');

    // Auto-select first if none selected
    if (!selectedBetGiftId && available.length) {
        const first = GIFTS.find(g => g.id === available[0].statueId);
        if (first) selectBetGift(first.id, true);
    }
    updateSpinBtn();
}

function selectBetGift(giftId, silent = false) {
    selectedBetGiftId = giftId;
    document.querySelectorAll('.gift-bet-item').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.gift-bet-item').forEach(el => {
        if (el.onclick?.toString().includes(giftId)) el.classList.add('selected');
    });
    // Re-render to set selected state properly
    if (!silent) renderGiftBetList();
    updateSpinBtn();
}

function updateSpinBtn() {
    const btn = document.getElementById('spinBtn');
    if (!btn) return;
    if (selectedBetGiftId && !isSpinning) {
        const gift = GIFTS.find(g => g.id === selectedBetGiftId);
        btn.disabled = false;
        btn.textContent = `🎰 Крутить (${gift?.emoji || ''} ${gift?.name || ''})`;
    } else {
        btn.disabled = true;
        btn.textContent = '🎰 Выберите подарок';
    }
}

// ==========================================
//  BOT GAME
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const spinBtn = document.getElementById('spinBtn');
    if (spinBtn) spinBtn.onclick = doSpin;
});

async function doSpin() {
    if (isSpinning || !selectedBetGiftId) return;
    const btn = document.getElementById('spinBtn');
    btn.disabled = true;
    isSpinning = true;

    try {
        const res = await fetch('/api/bot-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, betGiftId: selectedBetGiftId })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); btn.disabled = false; isSpinning = false; updateSpinBtn(); return; }

        // Update inventory immediately (bet gift removed)
        updateInventory(data.newInventory);

        const segments = data.participants.map(p => ({
            name: p.name, color: p.color, emoji: p.gift?.emoji
        }));
        drawWheelCanvas('wheel', segments, 0);

        animateWheel('wheel', segments, data.stopAngle, 5000, () => {
            updateBalance(data.newBalance);
            updateInventory(data.newInventory);

            setTimeout(() => {
                // Show win/lose modal
                const gift = GIFTS.find(g => g.id === selectedBetGiftId);
                if (data.isWin) {
                    if (data.wonCoins > 0) showResultModal(true, `+${data.wonCoins} 🪙 + ${data.wonGift?.emoji || '🎁'} ${data.wonGift?.name || ''}`, data.winner);
                    else showResultModal(true, `${data.wonGift?.emoji || '🎁'} ${data.wonGift?.name || 'Подарок'}`, data.winner);
                } else {
                    showResultModal(false, `Проиграл: ${gift?.emoji || ''} ${gift?.name || ''}`, data.winner);
                }

                // Bonus gift drop with keep/sell choice
                if (data.bonusGift) {
                    setTimeout(() => showGiftDropModal(data.bonusGift), 800);
                }

                isSpinning = false;
                renderGiftBetList();
            }, 400);
        });
    } catch (e) {
        console.error(e);
        showToast('Ошибка игры', 'error');
        isSpinning = false;
        renderGiftBetList();
    }
}

// ==========================================
//  NAVIGATION
// ==========================================
function switchTab(tab) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const screen = document.getElementById(`screen-${tab}`);
    if (screen) screen.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(el => {
        if (el.dataset.tab === tab) el.classList.add('active');
    });

    if (tab === 'pvp')     socket.emit('get_rooms');
    if (tab === 'market')  loadMarket();
    if (tab === 'cases')   loadCases();
    if (tab === 'profile') loadProfile();
    if (tab === 'spins')   renderGiftBetList();
}

// ==========================================
//  CASES
// ==========================================

// All possible gifts for strip (used in animation)
const STRIP_POOL = [
    { id: 'neon_cat',        emoji: '🐱', name: 'Неоновый Кот',     rarity: 'common'    },
    { id: 'moon_bunny',      emoji: '🐰', name: 'Лунный Кролик',    rarity: 'common'    },
    { id: 'robot_buddy',     emoji: '🤖', name: 'Робот-Дружище',    rarity: 'common'    },
    { id: 'prison_steve',    emoji: '⛓️', name: 'Тюремный Стив',    rarity: 'rare'      },
    { id: 'rocket_frog',     emoji: '🐸', name: 'Ракетная Лягушка', rarity: 'rare'      },
    { id: 'golden_star',     emoji: '⭐', name: 'Золотая Звезда',   rarity: 'rare'      },
    { id: 'crystal_ball',    emoji: '🔮', name: 'Хрустальный Шар',  rarity: 'rare'      },
    { id: 'space_helmet',    emoji: '🚀', name: 'Шлем Космонавта',  rarity: 'rare'      },
    { id: 'cyber_bear',      emoji: '🐻', name: 'Кибер Медведь',    rarity: 'epic'      },
    { id: 'diamond_hamster', emoji: '💎', name: 'Алмазный Хомяк',   rarity: 'epic'      },
    { id: 'crypto_wolf',     emoji: '🐺', name: 'Крипто Волк',      rarity: 'epic'      },
    { id: 'fire_phoenix',    emoji: '🦅', name: 'Огненный Феникс',  rarity: 'epic'      },
    { id: 'gold_durov',      emoji: '🏆', name: 'Золотой Дуров',    rarity: 'legendary' },
    { id: 'pixel_dragon',    emoji: '🐉', name: 'Пиксельный Дракон',rarity: 'legendary' },
    { id: 'ton_king',        emoji: '👑', name: 'TON Король',        rarity: 'legendary' },
];

let caseAnimating = false;

function loadCases() {
    const casesEl = document.getElementById('casesBalance');
    if (casesEl) casesEl.textContent = Math.floor(balance).toLocaleString('ru');
    renderCasesInventory();
    updateCaseBtn();
}

function updateCaseBtn() {
    const btn = document.getElementById('openCaseBtn');
    if (!btn) return;
    if (balance < 500) {
        btn.disabled = true;
        btn.textContent = 'Недостаточно монет 🪙';
    } else {
        btn.disabled = false;
        btn.textContent = 'Открыть за 500 🪙';
    }
}

async function openCase() {
    if (caseAnimating) return;
    const btn = document.getElementById('openCaseBtn');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch('/api/open-case', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id })
        });
        const data = await res.json();
        if (data.error) {
            showToast(data.error, 'error');
            if (btn) btn.disabled = false;
            return;
        }

        updateBalance(data.newBalance);
        // Don't update inventory yet — wait for animation to finish
        await playCaseAnimation(data.gift, () => {
            updateInventory(data.newInventory);
            renderCasesInventory();
            updateCaseBtn();
        });

    } catch {
        showToast('Ошибка открытия кейса', 'error');
        if (btn) btn.disabled = false;
        caseAnimating = false;
    }
}

function buildStripItems(targetGift) {
    // Build a long strip: ~40 random items + winner at position ~35
    const TOTAL = 42;
    const WINNER_POS = 35;
    const items = [];

    // Weighted random from pool
    function randomItem() {
        const r = Math.random();
        let pool;
        if (r < 0.50)      pool = STRIP_POOL.filter(g => g.rarity === 'common');
        else if (r < 0.80) pool = STRIP_POOL.filter(g => g.rarity === 'rare');
        else if (r < 0.95) pool = STRIP_POOL.filter(g => g.rarity === 'epic');
        else               pool = STRIP_POOL.filter(g => g.rarity === 'legendary');
        return pool[Math.floor(Math.random() * pool.length)];
    }

    for (let i = 0; i < TOTAL; i++) {
        items.push(i === WINNER_POS ? targetGift : randomItem());
    }
    return { items, winnerPos: WINNER_POS };
}

function renderStripItem(item) {
    return `<div class="case-anim-item ${item.rarity}" data-id="${item.id}">
        <span class="ai-emoji">${item.emoji}</span>
        <span class="ai-name">${item.name}</span>
    </div>`;
}

async function playCaseAnimation(wonGift, onComplete) {
    caseAnimating = true;

    const card      = document.getElementById('caseCard');
    const animWrap  = document.getElementById('caseAnimWrap');
    const track     = document.getElementById('caseAnimTrack');
    const resultEl  = document.getElementById('caseResult');
    const glow      = document.getElementById('caseBoxGlow');

    // Pulse the box first
    const boxWrap = document.getElementById('caseBoxWrap');
    boxWrap.style.transform = 'scale(0.92)';
    await sleep(120);
    boxWrap.style.transform = '';

    // Build strip
    const { items, winnerPos } = buildStripItems(wonGift);
    track.innerHTML = items.map(renderStripItem).join('');

    // Show strip, hide card
    resultEl.style.display = 'none';
    card.style.display = 'none';
    animWrap.style.display = 'block';

    // Add center-line overlay
    const outer = document.querySelector('.case-anim-track-outer');
    if (!outer.querySelector('.center-line')) {
        const cl = document.createElement('div');
        cl.className = 'center-line';
        outer.appendChild(cl);
    }

    // Measure item width
    const itemEl    = track.children[0];
    const itemW     = itemEl.offsetWidth + 8; // width + gap
    const trackOuter = outer;
    const centerOffset = trackOuter.offsetWidth / 2; // center of visible area

    // Target: winner item center aligned to strip center
    const targetTranslate = -(winnerPos * itemW - centerOffset + itemW / 2);

    // Ease-out cubic animation
    const DURATION = 5000;
    const startX   = 0;
    const endX     = targetTranslate;

    let lastHighlightIdx = -1;

    function easeOut(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    await new Promise(resolve => {
        const startTime = performance.now();

        function frame(now) {
            const elapsed  = now - startTime;
            const progress = Math.min(elapsed / DURATION, 1);
            const eased    = easeOut(progress);
            const currentX = startX + (endX - startX) * eased;

            track.style.transform = `translateX(${currentX}px)`;

            // Highlight item under center pointer
            const centerInTrack = -currentX + centerOffset;
            const idx = Math.floor(centerInTrack / itemW);
            if (idx !== lastHighlightIdx && idx >= 0 && idx < items.length) {
                lastHighlightIdx = idx;
                // Remove all highlights
                Array.from(track.children).forEach(el => {
                    el.classList.remove('highlight-common', 'highlight-rare', 'highlight-epic', 'highlight-legendary');
                });
                const el = track.children[idx];
                if (el) {
                    const r = items[idx].rarity;
                    el.classList.add(`highlight-${r}`);
                    // Update box glow colour
                    const glowColors = {
                        common:    'rgba(142,142,147,0.25)',
                        rare:      'rgba(59,158,222,0.3)',
                        epic:      'rgba(175,82,222,0.35)',
                        legendary: 'rgba(255,214,10,0.4)',
                    };
                    if (glow) {
                        glow.style.background = `radial-gradient(ellipse at 50% 50%, ${glowColors[r]} 0%, transparent 70%)`;
                        glow.style.opacity = '1';
                    }
                }
            }

            if (progress < 1) {
                requestAnimationFrame(frame);
            } else {
                resolve();
            }
        }

        requestAnimationFrame(frame);
    });

    // Final: highlight winner
    Array.from(track.children).forEach(el =>
        el.classList.remove('highlight-common', 'highlight-rare', 'highlight-epic', 'highlight-legendary')
    );
    const winnerEl = track.children[winnerPos];
    if (winnerEl) {
        winnerEl.classList.add(`highlight-${wonGift.rarity}`, 'winner');
    }

    await sleep(600);

    // Show result card
    animWrap.style.display = 'none';
    const rarityColor = RARITY_COLORS[wonGift.rarity];
    const rarityName  = RARITY_NAMES[wonGift.rarity];
    resultEl.style.display  = 'block';
    resultEl.style.border   = `1px solid ${rarityColor}44`;
    resultEl.style.boxShadow = `0 0 30px ${rarityColor}33`;
    resultEl.innerHTML = `
        <div style="font-size:11px;letter-spacing:2px;color:${rarityColor};font-weight:700;margin-bottom:8px">✨ ВЫ ПОЛУЧИЛИ</div>
        <div style="font-size:64px;margin:8px 0;filter:drop-shadow(0 0 20px ${rarityColor}88)">${wonGift.emoji}</div>
        <div style="font-size:20px;font-weight:800;margin-bottom:4px">${wonGift.name}</div>
        <div style="color:${rarityColor};font-size:13px;font-weight:700;margin-bottom:6px">${rarityName}</div>
        <div style="color:var(--green);font-size:12px;margin-bottom:16px">+${wonGift.bonus}% к бонусам</div>
        <div style="display:flex;gap:8px">
            <button class="big-btn secondary-btn" style="flex:1;padding:12px" onclick="caseGiftDecide('sell','${wonGift.id}')">💰 Продать</button>
            <button class="big-btn" style="flex:1;padding:12px" onclick="caseGiftDecide('keep','${wonGift.id}')">📦 Забрать</button>
        </div>`;

    card.style.display = 'block';
    caseAnimating = false;

    if (onComplete) onComplete();
}

async function caseGiftDecide(choice, giftId) {
    const resultEl = document.getElementById('caseResult');
    const gift = GIFTS.find(g => g.id === giftId);

    if (choice === 'sell' && gift) {
        try {
            const res = await fetch('/api/market/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, statueId: giftId, price: gift.basePrice, count: 1 })
            });
            const data = await res.json();
            if (data.error) { showToast(data.error, 'error'); }
            else { updateInventory(data.newInventory); showToast(`💰 Выставлено за ${gift.basePrice} 🪙`, 'success'); }
        } catch { showToast('Ошибка продажи', 'error'); }
    } else {
        showToast(`📦 ${gift?.name || 'Подарок'} добавлен в инвентарь!`, 'success');
    }

    if (resultEl) resultEl.style.display = 'none';
    renderGiftBetList();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function renderCasesInventory() {
    const el = document.getElementById('casesInventory');
    if (!el) return;
    if (!inventory.length) {
        el.innerHTML = '<div class="empty-state">Нет подарков. Откройте кейс!</div>';
        return;
    }
    el.innerHTML = inventory.map(item => {
        const gift = GIFTS.find(g => g.id === item.statueId);
        if (!gift) return '';
        const avail = item.count - (item.listedInMarket || 0);
        return `
        <div class="gift-card">
            <span class="gift-card-emoji">${gift.emoji}</span>
            <div class="gift-card-name">${gift.name}</div>
            <div class="gift-card-count">x${avail}${item.listedInMarket ? ` (${item.listedInMarket} в маркете)` : ''}</div>
            <div class="gift-card-rarity" style="color:${RARITY_COLORS[gift.rarity]}">${RARITY_NAMES[gift.rarity]}</div>
        </div>`;
    }).join('');
}

// ==========================================
//  MARKET
// ==========================================
async function loadMarket() {
    renderMyInventoryMarket();
    const list = document.getElementById('marketList');
    if (list) list.innerHTML = '<div class="loading-state">Загрузка...</div>';

    try {
        const res = await fetch('/api/market');
        const items = await res.json();
        if (!list) return;
        if (!items.length) { list.innerHTML = '<div class="empty-state">Рынок пуст</div>'; return; }
        list.innerHTML = items.map(item => {
            const gift = item.gift;
            const isOwn = item.sellerId == user.id;
            return `
            <div class="market-card">
                <div class="market-card-emoji">${gift.emoji}</div>
                <div class="market-card-info">
                    <div class="market-card-name">${gift.name}</div>
                    <div class="market-card-rarity" style="color:${RARITY_COLORS[gift.rarity]}">${RARITY_NAMES[gift.rarity]}</div>
                    <div class="market-card-seller">от ${item.sellerName} · x${item.count}</div>
                    <div class="market-card-bonus">+${gift.bonus}% к бонусам</div>
                </div>
                <div class="market-card-right">
                    <div class="market-price">${item.price.toLocaleString('ru')} 🪙</div>
                    ${isOwn
                        ? `<div class="my-listing-badge">Ваше</div>`
                        : `<button class="buy-btn" onclick="buyMarketItem('${item._id}',${item.price})">Купить</button>`
                    }
                </div>
            </div>`;
        }).join('');
    } catch {
        if (list) list.innerHTML = '<div style="color:#ff3b30;text-align:center;padding:20px">Ошибка загрузки</div>';
    }
}

function renderMyInventoryMarket() {
    const el = document.getElementById('myInventoryMarket');
    if (!el) return;
    const available = inventory.filter(item => item.count - (item.listedInMarket || 0) > 0);
    if (!available.length) { el.innerHTML = '<div class="empty-state">Нет подарков для продажи</div>'; return; }
    el.innerHTML = available.map(item => {
        const gift = GIFTS.find(g => g.id === item.statueId);
        if (!gift) return '';
        const avail = item.count - (item.listedInMarket || 0);
        return `
        <div class="gift-card" onclick="quickSell('${gift.id}')" style="cursor:pointer">
            <span class="gift-card-emoji">${gift.emoji}</span>
            <div class="gift-card-name">${gift.name}</div>
            <div class="gift-card-count">x${avail}</div>
            <div class="gift-card-rarity" style="color:${RARITY_COLORS[gift.rarity]}">${RARITY_NAMES[gift.rarity]}</div>
        </div>`;
    }).join('');
}

function showSellModal() {
    const available = inventory.filter(item => item.count - (item.listedInMarket || 0) > 0);
    if (!available.length) { showToast('Нет подарков для продажи', 'error'); return; }
    renderSellGiftSelect(available);
    openModal('sellModal');
}

function quickSell(giftId) {
    const item = inventory.find(i => i.statueId === giftId);
    const avail = item ? item.count - (item.listedInMarket || 0) : 0;
    if (!avail) { showToast('Нет доступных подарков', 'error'); return; }
    const available = inventory.filter(it => it.count - (it.listedInMarket || 0) > 0);
    renderSellGiftSelect(available, giftId);
    openModal('sellModal');
}

function renderSellGiftSelect(available, preSelected = null) {
    const el = document.getElementById('sellGiftSelect');
    if (!el) return;
    el.innerHTML = available.map(item => {
        const gift = GIFTS.find(g => g.id === item.statueId);
        if (!gift) return '';
        const sel = (preSelected || sellGiftId) === gift.id ? 'selected' : '';
        return `
        <div class="gift-select-item ${sel}" onclick="selectSellGift('${gift.id}')">
            <span class="gi-em">${gift.emoji}</span>
            <div class="gi-nm">${gift.name}</div>
        </div>`;
    }).join('');
    if (!sellGiftId && available.length) {
        const first = GIFTS.find(g => g.id === available[0].statueId);
        if (first) { sellGiftId = preSelected || first.id; setDefaultSellPrice(sellGiftId); }
    }
    if (preSelected) { sellGiftId = preSelected; setDefaultSellPrice(preSelected); }
}

function selectSellGift(giftId) {
    sellGiftId = giftId;
    document.querySelectorAll('#sellGiftSelect .gift-select-item').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#sellGiftSelect .gift-select-item').forEach(el => {
        if (el.onclick?.toString().includes(giftId)) el.classList.add('selected');
    });
    renderSellGiftSelect(inventory.filter(i => i.count - (i.listedInMarket||0) > 0), giftId);
    setDefaultSellPrice(giftId);
}

function setDefaultSellPrice(giftId) {
    const gift = GIFTS.find(g => g.id === giftId);
    if (gift) { const input = document.getElementById('sellPriceInput'); if (input) input.value = gift.basePrice; }
}

async function confirmSell() {
    if (!sellGiftId) { showToast('Выберите подарок', 'error'); return; }
    const price = parseInt(document.getElementById('sellPriceInput')?.value);
    if (!price || price < 1) { showToast('Укажите цену', 'error'); return; }

    try {
        const res = await fetch('/api/market/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, statueId: sellGiftId, price, count: 1 })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }
        updateInventory(data.newInventory);
        closeModal('sellModal');
        showToast('✅ Выставлено на продажу!', 'success');
        loadMarket();
    } catch { showToast('Ошибка', 'error'); }
}

async function buyMarketItem(listingId, price) {
    if (!confirm(`Купить за ${price.toLocaleString('ru')} 🪙?`)) return;
    if (balance < price) { showToast('Недостаточно монет!', 'error'); return; }
    try {
        const res = await fetch('/api/market/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buyerId: user.id, listingId })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }
        updateBalance(data.newBalance);
        updateInventory(data.newInventory);
        showToast('✅ Куплено!', 'success');
        loadMarket();
    } catch { showToast('Ошибка покупки', 'error'); }
}

// ==========================================
//  PVP LOBBY
// ==========================================
function showCreateRoomModal() {
    const available = inventory.filter(item => item.count - (item.listedInMarket || 0) > 0);
    if (!available.length) { showToast('Нужен хотя бы один подарок для ставки!', 'error'); return; }

    createRoomGiftId = null;
    document.getElementById('maxPlayersVal').textContent = createRoomMaxPlayers;

    const el = document.getElementById('roomGiftSelect');
    if (el) {
        el.innerHTML = available.map(item => {
            const gift = GIFTS.find(g => g.id === item.statueId);
            if (!gift) return '';
            return `
            <div class="gift-select-item" onclick="selectCreateRoomGift('${gift.id}')">
                <span class="gi-em">${gift.emoji}</span>
                <div class="gi-nm">${gift.name}</div>
            </div>`;
        }).join('');
        // Auto select first
        if (available.length) {
            const first = GIFTS.find(g => g.id === available[0].statueId);
            if (first) selectCreateRoomGift(first.id);
        }
    }
    openModal('createRoomModal');
}

function selectCreateRoomGift(giftId) {
    createRoomGiftId = giftId;
    document.querySelectorAll('#roomGiftSelect .gift-select-item').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#roomGiftSelect .gift-select-item').forEach(el => {
        if (el.onclick?.toString().includes(giftId)) el.classList.add('selected');
    });
}

function changeMaxPlayers(delta) {
    createRoomMaxPlayers = Math.min(Math.max(createRoomMaxPlayers + delta, 2), 6);
    document.getElementById('maxPlayersVal').textContent = createRoomMaxPlayers;
}

function confirmCreateRoom() {
    if (!createRoomGiftId) { showToast('Выберите подарок для ставки', 'error'); return; }
    socket.emit('create_room', { betGiftId: createRoomGiftId, maxPlayers: createRoomMaxPlayers });
    closeModal('createRoomModal');
}

function joinRoom(id) { socket.emit('join_room', id); }

function leaveRoom() {
    socket.emit('leave_room');
    currentRoom = null;
    switchTab('pvp');
}

function sendReady() {
    const btn = document.getElementById('readyBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Ожидание...';
    socket.emit('player_ready');
}

function forceStart() {
    socket.emit('force_start');
}

// ==========================================
//  SOCKET EVENTS
// ==========================================
socket.on('online_count', cnt => {
    const el = document.getElementById('onlineCount');
    if (el) el.textContent = cnt;
});

socket.on('update_rooms', (rooms) => {
    const list = document.getElementById('roomList');
    if (!list) return;
    if (!rooms.length) { list.innerHTML = '<div class="empty-state">Нет открытых комнат — создайте первую!</div>'; return; }
    list.innerHTML = rooms.map(r => {
        const gift = r.betGift;
        return `
        <div class="room-card">
            <span class="room-gift-preview">${gift?.emoji || '🎁'}</span>
            <div class="room-card-info">
                <div class="room-card-creator">${r.creator}</div>
                <div class="room-card-sub">
                    <span>${gift?.name || 'Подарок'}</span>
                    <span>·</span>
                    <span>👥 ${r.players}/${r.maxPlayers}</span>
                </div>
            </div>
            <button class="join-btn" onclick="joinRoom('${r.id}')">Войти</button>
        </div>`;
    }).join('');
});

socket.on('room_joined', (room) => {
    currentRoom = room;
    pvpWheelDone = false;
    renderRoom(room);
    switchTab('room');
});

socket.on('room_update', (room) => {
    currentRoom = room;
    if (document.getElementById('screen-room')?.classList.contains('active')) renderRoom(room);
});

socket.on('left_room', () => { currentRoom = null; });

socket.on('error', (msg) => showToast(msg, 'error'));

socket.on('not_all_ready', ({ notReady }) => {
    showToast(`Не готовы: ${notReady.join(', ')}`, 'error');
});

socket.on('inventory_update', (newInventory) => {
    updateInventory(newInventory);
});

socket.on('game_start', (data) => {
    _pendingGameOver = null;
    pvpWheelDone = false;

    const wc = document.getElementById('pvp-wheel-container');
    if (wc) wc.style.display = 'block';

    const segments = data.players.map(p => ({
        name: p.user.username,
        color: data.playerColors[p.user.telegramId] || '#8e8e93',
        emoji: data.potGift?.emoji
    }));

    const statusEl = document.getElementById('roomStatus');
    if (statusEl) statusEl.innerHTML = `<span style="color:#ffd60a;font-weight:700">🎲 КРУТИМ! Ставка: ${data.potGift?.emoji} ${data.potGift?.name || ''} × ${data.pot}</span>`;

    document.getElementById('readyBtn').style.display = 'none';
    document.getElementById('startBtn').style.display = 'none';

    drawWheelCanvas('pvp-wheel', segments, 0);
    animateWheel('pvp-wheel', segments, data.stopAngle, 5500, () => {
        pvpWheelDone = true;
        if (_pendingGameOver) { _showPvPResult(_pendingGameOver); _pendingGameOver = null; }
    });
});

socket.on('game_over', (data) => {
    if (!pvpWheelDone) _pendingGameOver = data;
    else _showPvPResult(data);
});

function _showPvPResult(data) {
    const isWin = String(data.winner.telegramId) === String(user.id);
    const gift = data.betGift;
    if (isWin) {
        showResultModal(true, `🎁 ${gift?.emoji || ''} ${gift?.name || ''} × ${data.wonCount}`, data.winner.username);
    } else {
        showResultModal(false, `Победил: ${data.winner.username}`, `Проиграл ${gift?.emoji || '🎁'}`);
    }

    setTimeout(() => {
        closeModal('resultModal');
        switchTab('pvp');
        document.getElementById('pvp-wheel-container').style.display = 'none';
        const rb = document.getElementById('readyBtn');
        rb.style.display = 'block'; rb.textContent = '✅ Готов'; rb.disabled = false;
        currentRoom = null;
    }, 4000);
}

socket.on('pvp_inventory_update', (data) => {
    if (String(data.telegramId) === String(user.id)) updateInventory(data.newInventory);
});

socket.on('balance_update', (bal) => updateBalance(bal));

// ==========================================
//  RENDER ROOM
// ==========================================
function renderRoom(room) {
    document.getElementById('roomIdDisplay').innerHTML = `⚔️ Комната <b style="color:#3b9ede">#${room.id}</b>`;

    const betInfo = document.getElementById('roomBetInfo');
    if (betInfo) {
        betInfo.innerHTML = `<span style="font-size:28px">${room.betGift?.emoji || '🎁'}</span> <div><div style="font-weight:700">${room.betGift?.name || 'Подарок'}</div><div style="font-size:12px;color:#636366">Ставка · Макс. ${room.maxPlayers} игроков</div></div>`;
    }

    const grid = document.getElementById('playersGrid');
    grid.innerHTML = '';

    for (let i = 0; i < room.maxPlayers; i++) {
        const p = room.players[i];
        if (p) {
            const color = room.playerColors[p.user.telegramId] || '#8e8e93';
            const isMe  = String(p.user.telegramId) === String(user.id);
            grid.innerHTML += `
            <div class="player-slot ${p.ready ? 'ready' : ''}" style="border-color:${p.ready ? '#34c759' : color}">
                <div class="slot-avatar">${p.user.telegramId == 1743237033 ? '👑' : '👤'}</div>
                <div class="slot-name" style="color:${color}">${isMe ? '★ ' : ''}${p.user.username}</div>
                <div class="slot-status">${p.ready ? '✅' : '⏳'}</div>
            </div>`;
        } else {
            grid.innerHTML += `<div class="player-slot empty"><div class="slot-avatar" style="font-size:20px;opacity:0.3">+</div><div class="slot-status" style="opacity:0.3">Ожидание</div></div>`;
        }
    }

    const statusEl = document.getElementById('roomStatus');
    if (statusEl && room.status === 'waiting') {
        const readyCount = room.players.filter(p => p.ready).length;
        statusEl.textContent = `Игроков: ${room.players.length}/${room.maxPlayers} · Готовы: ${readyCount}/${room.players.length}`;
    }

    const myPlayer = room.players.find(p => String(p.user.telegramId) === String(user.id));
    const readyBtn = document.getElementById('readyBtn');
    const startBtn = document.getElementById('startBtn');

    if (myPlayer?.ready) {
        readyBtn.textContent = '✅ Вы готовы'; readyBtn.disabled = true;
    } else if (room.status === 'waiting') {
        readyBtn.textContent = '✅ Готов'; readyBtn.disabled = false;
    }

    // Show force start button only for creator
    if (startBtn) {
        startBtn.style.display = (room.creator == user.id && room.status === 'waiting' && room.players.length >= 2) ? 'block' : 'none';
    }
}

// ==========================================
//  PROFILE
// ==========================================
async function loadProfile() {
    const el = document.getElementById('profileInfo');
    if (!el) return;
    el.innerHTML = '<div class="loading-state">Загрузка...</div>';
    try {
        const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id }) });
        const data = await res.json();
        const rank = RANKS.find(r => r.name === data.rank) || RANKS[0];
        const winRate = data.stats.games ? ((data.stats.wins / data.stats.games) * 100).toFixed(1) : 0;

        el.innerHTML = `
        <div class="profile-hero">
            <div class="profile-rank-icon">${rank.icon}</div>
            <div class="profile-username">${data.username || data.firstName || 'Player'}</div>
            <div class="rank-badge" style="background:${rank.color}22;color:${rank.color};border:1px solid ${rank.color}44">${rank.name}</div>
        </div>
        <div class="stats-card">
            <div class="stat-row"><span class="stat-label">🪙 Монеты</span><span class="stat-value" style="color:#ffd60a">${Math.floor(data.balance).toLocaleString('ru')}</span></div>
            <div class="stat-row"><span class="stat-label">🎮 Игр</span><span class="stat-value">${data.stats.games}</span></div>
            <div class="stat-row"><span class="stat-label">🏆 Побед</span><span class="stat-value" style="color:#34c759">${data.stats.wins}</span></div>
            <div class="stat-row"><span class="stat-label">📊 Винрейт</span><span class="stat-value" style="color:${winRate>=40?'#34c759':'#ff3b30'}">${winRate}%</span></div>
            <div class="stat-row"><span class="stat-label">📦 Подарков</span><span class="stat-value">${data.inventory?.reduce((a,i)=>a+i.count,0)||0}</span></div>
        </div>
        <div class="section-label">Последние игры</div>
        <div class="last-games-list">
            ${(data.stats.lastGames?.slice().reverse() || []).map(g => `
            <div class="game-row ${g.result}">
                <div style="display:flex;align-items:center;gap:8px">
                    <span>${g.type==='bot'?'🤖':'⚔️'}</span>
                    <span>${g.type==='bot'?'Боты':'PvP'}</span>
                    <span style="font-size:11px;color:#636366">${new Date(g.date).toLocaleDateString('ru-RU')}</span>
                </div>
                <span style="color:${g.result==='win'?'#34c759':'#ff3b30'};font-weight:700">${g.result==='win'?'Победа':'Поражение'}</span>
            </div>`).join('') || '<div class="empty-state">Нет игр</div>'}
        </div>`;
    } catch { el.innerHTML = '<div style="color:#ff3b30;text-align:center;padding:20px">Ошибка загрузки</div>'; }
}

// ==========================================
//  MODALS
// ==========================================
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

function showResultModal(isWin, detail, winnerName) {
    document.getElementById('modalEmoji').textContent = isWin ? '🏆' : '💀';
    document.getElementById('modalTitle').textContent = isWin ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
    document.getElementById('modalTitle').style.color = isWin ? '#34c759' : '#ff3b30';
    document.getElementById('modalSub').textContent = detail || (isWin ? '' : `Победил: ${winnerName}`);
    openModal('resultModal');
}

// Gift drop with keep/sell choice
function showGiftDropModal(gift, fromCase = false) {
    pendingGift = gift;
    document.getElementById('giftModalEmoji').textContent = gift.emoji;
    document.getElementById('giftModalName').textContent = gift.name;
    document.getElementById('giftModalRarity').innerHTML = `<span style="color:${RARITY_COLORS[gift.rarity]}">${RARITY_NAMES[gift.rarity]}</span>`;
    document.getElementById('giftModalBonus').textContent = `+${gift.bonus}% к бонусам`;
    openModal('giftModal');
}

async function handleGiftDecision(choice) {
    closeModal('giftModal');
    if (!pendingGift) return;
    if (choice === 'sell') {
        // Immediately list at base price
        try {
            const res = await fetch('/api/market/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, statueId: pendingGift.id, price: pendingGift.basePrice, count: 1 })
            });
            const data = await res.json();
            if (data.error) { showToast(data.error, 'error'); }
            else { updateInventory(data.newInventory); showToast(`💰 Выставлено за ${pendingGift.basePrice} 🪙`, 'success'); }
        } catch { showToast('Ошибка продажи', 'error'); }
    } else {
        showToast(`📦 ${pendingGift.name} добавлен в инвентарь!`, 'success');
        renderGiftBetList();
    }
    pendingGift = null;
}

// ==========================================
//  TOAST
// ==========================================
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2500);
}

// ==========================================
//  START
// ==========================================
init();
