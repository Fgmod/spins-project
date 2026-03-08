require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://makarychev887_db_user:VjHYgC26wBnnmMUW@cluster0.omk9t2w.mongodb.net/?appName=Cluster0';
const BOT_TOKEN = process.env.BOT_TOKEN || '7904673285:AAFWIngrdaMhM47g8bmBFG4rv45zUfbS05A';
const ADMIN_ID = 1743237033;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const bot = new Telegraf(BOT_TOKEN);

const RANKS = [
    { name: 'Новичок',  minBalance: 0,      color: '#8e8e93', icon: '🌱' },
    { name: 'Игрок',    minBalance: 2000,   color: '#29b6f6', icon: '🎮' },
    { name: 'Лудоман',  minBalance: 10000,  color: '#ff9500', icon: '🎲' },
    { name: 'Инвестор', minBalance: 50000,  color: '#ffd700', icon: '💎' },
    { name: 'Шейх',     minBalance: 200000, color: '#ff2d55', icon: '👑' }
];

// Extended gifts/statues list
const GIFTS = [
    { id: 'gold_durov',      name: 'Золотой Дуров',    rarity: 'legendary', emoji: '🏆', bonus: 2.5, basePrice: 5000 },
    { id: 'diamond_hamster', name: 'Алмазный Хомяк',   rarity: 'epic',      emoji: '💎', bonus: 1.5, basePrice: 2000 },
    { id: 'ton_king',        name: 'TON Король',        rarity: 'legendary', emoji: '👑', bonus: 3.0, basePrice: 8000 },
    { id: 'crypto_wolf',     name: 'Крипто Волк',       rarity: 'epic',      emoji: '🐺', bonus: 1.2, basePrice: 1500 },
    { id: 'prison_steve',    name: 'Тюремный Стив',     rarity: 'rare',      emoji: '⛓️', bonus: 0.5, basePrice: 500 },
    { id: 'rocket_frog',     name: 'Ракетная Лягушка',  rarity: 'rare',      emoji: '🐸', bonus: 0.7, basePrice: 700 },
    { id: 'neon_cat',        name: 'Неоновый Кот',      rarity: 'common',    emoji: '🐱', bonus: 0.2, basePrice: 150 },
    { id: 'golden_star',     name: 'Золотая Звезда',    rarity: 'rare',      emoji: '⭐', bonus: 0.8, basePrice: 800 },
    { id: 'cyber_bear',      name: 'Кибер Медведь',     rarity: 'epic',      emoji: '🐻', bonus: 1.0, basePrice: 1200 },
    { id: 'pixel_dragon',    name: 'Пиксельный Дракон', rarity: 'legendary', emoji: '🐉', bonus: 2.0, basePrice: 4000 },
    { id: 'moon_bunny',      name: 'Лунный Кролик',     rarity: 'common',    emoji: '🐰', bonus: 0.3, basePrice: 200 },
    { id: 'fire_phoenix',    name: 'Огненный Феникс',   rarity: 'epic',      emoji: '🦅', bonus: 1.8, basePrice: 2500 },
    { id: 'crystal_ball',    name: 'Хрустальный Шар',   rarity: 'rare',      emoji: '🔮', bonus: 0.6, basePrice: 600 },
    { id: 'robot_buddy',     name: 'Робот-Дружище',     rarity: 'common',    emoji: '🤖', bonus: 0.25, basePrice: 180 },
    { id: 'space_helmet',    name: 'Шлем Космонавта',   rarity: 'rare',      emoji: '🚀', bonus: 0.9, basePrice: 900 },
];

const RARITY_COLORS = { common: '#8e8e93', rare: '#007aff', epic: '#9d4edd', legendary: '#ffd700' };

const CASE_GIFTS_BY_RARITY = {
    common: GIFTS.filter(g => g.rarity === 'common'),
    rare: GIFTS.filter(g => g.rarity === 'rare'),
    epic: GIFTS.filter(g => g.rarity === 'epic'),
    legendary: GIFTS.filter(g => g.rarity === 'legendary'),
};

function rollCaseGift() {
    const roll = Math.random();
    let pool;
    if (roll < 0.50)      pool = CASE_GIFTS_BY_RARITY.common;
    else if (roll < 0.80) pool = CASE_GIFTS_BY_RARITY.rare;
    else if (roll < 0.95) pool = CASE_GIFTS_BY_RARITY.epic;
    else                  pool = CASE_GIFTS_BY_RARITY.legendary;
    return pool[Math.floor(Math.random() * pool.length)];
}

const PLAYER_PALETTES = [
    ['#FF2D55', '#007AFF', '#34C759', '#FF9500', '#9D4EDD', '#FFD700'],
    ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'],
];

// ── SCHEMAS ────────────────────────────────────────────────────────────────

const LastGameSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['bot', 'pvp'] },
    result: { type: String, enum: ['win', 'loss'] },
    amount: Number,
    giftId: String
}, { _id: false });

const InventoryItemSchema = new mongoose.Schema({
    statueId: String,
    count: { type: Number, default: 1 },
    listedInMarket: { type: Number, default: 0 }
}, { _id: false });

const MarketListingSchema = new mongoose.Schema({
    sellerId: Number,
    sellerName: String,
    statueId: String,
    price: Number,
    count: { type: Number, default: 1 }
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
    telegramId:   { type: Number, required: true, unique: true },
    username:     { type: String, default: '' },
    firstName:    { type: String, default: '' },
    balance:      { type: Number, default: 5000 },  // coins for buying cases
    inventory:    [InventoryItemSchema],
    stats: {
        wins:      { type: Number, default: 0 },
        games:     { type: Number, default: 0 },
        totalWon:  { type: Number, default: 0 },
        lastGames: [LastGameSchema]
    },
    rank:         { type: String, default: 'Новичок' },
    rankColor:    { type: String, default: '#8e8e93' },
    lastCaseTime: { type: Date, default: null },
    freeCasesGiven: { type: Boolean, default: false },
}, { timestamps: true });

UserSchema.methods.updateRank = function () {
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (this.balance >= RANKS[i].minBalance) {
            this.rank = RANKS[i].name;
            this.rankColor = RANKS[i].color;
            break;
        }
    }
    return this.rank;
};

const User = mongoose.model('User', UserSchema);
const MarketListing = mongoose.model('MarketListing', MarketListingSchema);

// ── TELEGRAM BOT ───────────────────────────────────────────────────────────

const isAdmin = ctx => ctx.from.id === ADMIN_ID;
bot.start(ctx => ctx.reply('🎰 Добро пожаловать в SPINS!'));

bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
        const all = await User.find().sort({ balance: -1 });
        let msg = `<b>📊 ИГРОКИ (${all.length}):</b>\n\n`;
        all.slice(0, 20).forEach((u, i) => {
            const name = (u.username || u.firstName || 'Unknown').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
            msg += `${i+1}. ${name} | <b>${Math.floor(u.balance)} 🪙</b> | ${u.rank} | 📦${u.inventory.reduce((a,i)=>a+i.count,0)}\n`;
        });
        await ctx.replyWithHTML(msg);
    } catch { ctx.reply('Ошибка.'); }
});

bot.command('give', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const [, targetId, amountStr] = ctx.message.text.split(' ');
    const amount = parseFloat(amountStr);
    if (!targetId || isNaN(amount)) return ctx.reply('Формат: /give [ID] [Сумма]');
    const u = await User.findOneAndUpdate({ telegramId: targetId }, { $inc: { balance: amount } }, { new: true });
    if (!u) return ctx.reply('Игрок не найден.');
    u.updateRank(); await u.save();
    ctx.reply(`✅ Выдано ${amount} монет → ${u.username || u.firstName}`);
});

bot.launch();

// ── ROOM STATE ─────────────────────────────────────────────────────────────
let rooms = {};

// ── API ────────────────────────────────────────────────────────────────────

app.post('/api/auth', async (req, res) => {
    try {
        const { id, username, first_name } = req.body;
        if (!id) return res.status(400).json({ error: 'ID required' });
        let user = await User.findOne({ telegramId: id });
        if (!user) {
            user = new User({
                telegramId: id, username: username || '', firstName: first_name || '',
                rank: id === ADMIN_ID ? 'Шейх' : 'Новичок',
                rankColor: id === ADMIN_ID ? '#ff2d55' : '#8e8e93',
                balance: id === ADMIN_ID ? 999999 : 5000
            });
            // Give 3 free cases to new users who have no gifts
            if (id !== ADMIN_ID) {
                for (let i = 0; i < 3; i++) {
                    const gift = rollCaseGift();
                    const existing = user.inventory.find(it => it.statueId === gift.id);
                    if (existing) existing.count++; else user.inventory.push({ statueId: gift.id, count: 1 });
                }
                user.freeCasesGiven = true;
            }
            await user.save();
        } else {
            if (username) user.username = username;
            if (first_name) user.firstName = first_name;
            user.updateRank(); await user.save();
        }
        res.json(user);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Database error' }); }
});

// Bot game — uses coin balance, drops gifts occasionally
app.post('/api/bot-game', async (req, res) => {
    try {
        const { id, betGiftId } = req.body;
        const user = await User.findOne({ telegramId: id });
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

        let betGift = null;
        // If player bets a gift
        if (betGiftId) {
            const invItem = user.inventory.find(i => i.statueId === betGiftId);
            if (!invItem || invItem.count <= (invItem.listedInMarket || 0)) {
                return res.json({ error: 'Подарок недоступен' });
            }
            betGift = GIFTS.find(g => g.id === betGiftId);
            invItem.count--;
            if (invItem.count <= 0) user.inventory = user.inventory.filter(i => i.statueId !== betGiftId);
        } else {
            return res.json({ error: 'Выберите подарок для ставки' });
        }

        const botNames = ['Alex', 'Maria', 'John', 'Emma', 'Mike', 'Sarah', 'Ivan', 'Olga', 'Crypto', 'Luna'];
        const palette = [...PLAYER_PALETTES[Math.floor(Math.random() * PLAYER_PALETTES.length)]];
        for (let i = palette.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [palette[i], palette[j]] = [palette[j], palette[i]];
        }

        // Bots each put in random gifts
        const botGiftPool = GIFTS.filter(g => g.rarity === 'common' || g.rarity === 'rare');
        const bots = Array.from({ length: 5 }, (_, i) => ({
            name: botNames[Math.floor(Math.random() * botNames.length)] + (i > 0 ? i : ''),
            color: palette[i % palette.length],
            gift: botGiftPool[Math.floor(Math.random() * botGiftPool.length)]
        }));
        const userColor = palette[5 % palette.length];

        // Winner determination: 40% user wins
        let winner;
        const isWin = Math.random() < 0.40;
        if (isWin) {
            winner = { name: user.username || user.firstName || 'You', color: userColor, isUser: true };
        } else {
            winner = { ...bots[Math.floor(Math.random() * bots.length)], isUser: false };
        }

        // Prize: winner gets all gifts from pot (simplified: just the bet gift if win)
        let wonGift = null;
        let wonCoins = 0;

        if (isWin) {
            // 5-10% chance to drop coins when beating bots
            if (Math.random() < 0.08) {
                wonCoins = Math.floor(Math.random() * 400) + 100;
                user.balance += wonCoins;
            }
            // Win back own gift + random bot gift
            const botGift = bots[Math.floor(Math.random() * bots.length)].gift;
            wonGift = botGift;
            // Add bet gift back + won gift
            const ownItem = user.inventory.find(i => i.statueId === betGiftId);
            if (ownItem) ownItem.count++; else user.inventory.push({ statueId: betGiftId, count: 1 });
            const wonItem = user.inventory.find(i => i.statueId === botGift.id);
            if (wonItem) wonItem.count++; else user.inventory.push({ statueId: botGift.id, count: 1 });
            user.stats.wins++;
            user.stats.totalWon++;
        }

        user.stats.games++;
        user.stats.lastGames.push({ date: new Date(), type: 'bot', result: isWin ? 'win' : 'loss', amount: isWin ? 1 : -1, giftId: isWin ? (wonGift?.id || betGiftId) : betGiftId });
        if (user.stats.lastGames.length > 10) user.stats.lastGames = user.stats.lastGames.slice(-10);
        user.updateRank();

        // Random gift drop (from spinning itself — 5% chance of bonus gift)
        let bonusGift = null;
        if (Math.random() < 0.05) {
            bonusGift = rollCaseGift();
            const bonusItem = user.inventory.find(i => i.statueId === bonusGift.id);
            if (bonusItem) bonusItem.count++; else user.inventory.push({ statueId: bonusGift.id, count: 1 });
        }

        await user.save();

        res.json({
            isWin, winner: winner.name, winnerColor: winner.color,
            wonGift, wonCoins, bonusGift,
            newBalance: user.balance,
            newInventory: user.inventory,
            participants: [{ name: user.username || user.firstName || 'You', color: userColor, gift: betGift }, ...bots.map(b => ({ ...b }))],
            stopAngle: Math.floor(Math.random() * 360),
            newRank: user.rank, userColor
        });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
});

// ── CASES API ─────────────────────────────────────────────────────────────

const CASE_COST = 500; // coins per case

app.post('/api/open-case', async (req, res) => {
    try {
        const { id } = req.body;
        const user = await User.findOne({ telegramId: id });
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

        if (user.balance < CASE_COST) {
            return res.json({ error: `Недостаточно монет! Нужно ${CASE_COST} 🪙` });
        }

        user.balance -= CASE_COST;

        const gift = rollCaseGift();
        const existing = user.inventory.find(i => i.statueId === gift.id);
        if (existing) existing.count++; else user.inventory.push({ statueId: gift.id, count: 1 });

        user.updateRank();
        await user.save();

        res.json({ success: true, gift, newBalance: user.balance, newInventory: user.inventory });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/case-status/:id', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        if (!user) return res.status(404).json({ error: 'Not found' });
        res.json({ remaining: 0, balance: user.balance, caseCost: CASE_COST });
    } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── MARKET API ─────────────────────────────────────────────────────────────

app.get('/api/market', async (req, res) => {
    try {
        const listings = await MarketListing.find().sort({ createdAt: -1 });
        const enriched = listings.map(l => {
            const gift = GIFTS.find(g => g.id === l.statueId);
            return gift ? { ...l.toObject(), gift } : null;
        }).filter(Boolean);
        res.json(enriched);
    } catch { res.status(500).json({ error: 'Database error' }); }
});

app.post('/api/market/list', async (req, res) => {
    try {
        const { userId, statueId, price, count } = req.body;
        const user = await User.findOne({ telegramId: userId });
        if (!user) return res.status(404).json({ error: 'Not found' });

        const invItem = user.inventory.find(i => i.statueId === statueId);
        const available = invItem ? invItem.count - (invItem.listedInMarket || 0) : 0;
        if (available < count) return res.json({ error: 'Недостаточно предметов' });

        if (!invItem.listedInMarket) invItem.listedInMarket = 0;
        invItem.listedInMarket += count;

        await MarketListing.create({ sellerId: userId, sellerName: user.username || user.firstName || 'Игрок', statueId, price, count });
        await user.save();

        res.json({ success: true, newInventory: user.inventory });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/market/unlist', async (req, res) => {
    try {
        const { userId, listingId } = req.body;
        const listing = await MarketListing.findById(listingId);
        if (!listing || listing.sellerId !== parseInt(userId)) return res.json({ error: 'Не найдено' });

        const user = await User.findOne({ telegramId: userId });
        if (user) {
            const invItem = user.inventory.find(i => i.statueId === listing.statueId);
            if (invItem) invItem.listedInMarket = Math.max(0, (invItem.listedInMarket || 0) - listing.count);
            await user.save();
        }

        await MarketListing.findByIdAndDelete(listingId);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/market/buy', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { buyerId, listingId } = req.body;
        const listing = await MarketListing.findById(listingId).session(session);
        if (!listing) throw new Error('Объявление не найдено');
        if (listing.sellerId === parseInt(buyerId)) throw new Error('Нельзя купить у себя');

        const buyer  = await User.findOne({ telegramId: buyerId }).session(session);
        const seller = await User.findOne({ telegramId: listing.sellerId }).session(session);
        if (!buyer || !seller) throw new Error('Пользователь не найден');
        if (buyer.balance < listing.price) throw new Error('Недостаточно монет');

        buyer.balance  -= listing.price;
        seller.balance += listing.price;

        const sellerItem = seller.inventory.find(i => i.statueId === listing.statueId);
        if (!sellerItem || sellerItem.count < listing.count) throw new Error('Предмет недоступен');
        sellerItem.count -= listing.count;
        sellerItem.listedInMarket = Math.max(0, (sellerItem.listedInMarket || 0) - listing.count);
        if (sellerItem.count <= 0) seller.inventory = seller.inventory.filter(i => i.statueId !== listing.statueId);

        const buyerItem = buyer.inventory.find(i => i.statueId === listing.statueId);
        if (buyerItem) buyerItem.count += listing.count;
        else buyer.inventory.push({ statueId: listing.statueId, count: listing.count });

        buyer.updateRank(); seller.updateRank();
        await buyer.save(); await seller.save();
        await MarketListing.findByIdAndDelete(listingId).session(session);
        await session.commitTransaction();

        res.json({ success: true, newBalance: buyer.balance, newInventory: buyer.inventory });
    } catch (e) {
        await session.abortTransaction();
        res.status(400).json({ error: e.message });
    } finally { session.endSession(); }
});

// ── SOCKET PvP ─────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentUser   = null;

    socket.on('login', (userData) => {
        currentUser = userData;
        socket.userId = userData.telegramId;
        socket.join('global_lobby');
        io.to('global_lobby').emit('online_count', io.engine.clientsCount);
    });

    socket.on('get_rooms', () => socket.emit('update_rooms', getPublicRooms()));

    socket.on('create_room', async ({ betGiftId, maxPlayers }) => {
        try {
            if (!currentUser) return;
            if (currentRoomId && rooms[currentRoomId]) {
                socket.emit('error', 'Вы уже в комнате');
                return;
            }

            const user = await User.findOne({ telegramId: currentUser.telegramId });
            if (!user) return;

            const invItem = user.inventory.find(i => i.statueId === betGiftId);
            if (!invItem || invItem.count <= (invItem.listedInMarket || 0)) {
                socket.emit('error', 'У вас нет этого подарка'); return;
            }

            const betGift = GIFTS.find(g => g.id === betGiftId);
            if (!betGift) { socket.emit('error', 'Подарок не найден'); return; }

            const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
            const playerColor = PLAYER_PALETTES[0][0];
            const mp = Math.min(Math.max(parseInt(maxPlayers) || 6, 2), 6);

            rooms[roomId] = {
                id: roomId,
                creator: currentUser.telegramId,
                betGiftId,
                betGift,
                maxPlayers: mp,
                players: [{
                    socketId: socket.id,
                    user: {
                        telegramId: currentUser.telegramId,
                        username: currentUser.username || currentUser.firstName || 'Player',
                        rank: user.rank, rankColor: user.rankColor, color: playerColor
                    },
                    ready: false,
                    paid: false
                }],
                pot: [],
                status: 'waiting',
                playerColors: { [currentUser.telegramId]: playerColor }
            };

            currentRoomId = roomId;
            socket.join(roomId);
            socket.emit('room_joined', rooms[roomId]);
            io.to('global_lobby').emit('update_rooms', getPublicRooms());
        } catch (e) { console.error('create_room error:', e); }
    });

    socket.on('join_room', async (roomId) => {
        try {
            if (!currentUser) return;
            if (currentRoomId === roomId) return;
            if (currentRoomId && rooms[currentRoomId]) _leaveCurrentRoom();

            const room = rooms[roomId];
            if (!room) { socket.emit('error', 'Комната не найдена'); return; }
            if (room.status !== 'waiting') { socket.emit('error', 'Игра уже началась'); return; }
            if (room.players.length >= room.maxPlayers) { socket.emit('error', 'Комната полна'); return; }

            const alreadyIn = room.players.some(p => p.user.telegramId === currentUser.telegramId);
            if (alreadyIn) { socket.emit('room_joined', room); return; }

            const user = await User.findOne({ telegramId: currentUser.telegramId });
            if (!user) return;

            const usedColors = Object.values(room.playerColors);
            const palette = PLAYER_PALETTES[0];
            const playerColor = palette.find(c => !usedColors.includes(c)) || palette[room.players.length % palette.length];

            room.players.push({
                socketId: socket.id,
                user: { telegramId: currentUser.telegramId, username: currentUser.username || currentUser.firstName || 'Player', rank: user.rank, rankColor: user.rankColor, color: playerColor },
                ready: false, paid: false
            });
            room.playerColors[currentUser.telegramId] = playerColor;
            currentRoomId = roomId;
            socket.join(roomId);

            socket.emit('room_joined', room);
            socket.to(roomId).emit('room_update', room);
            io.to('global_lobby').emit('update_rooms', getPublicRooms());
        } catch (e) { console.error('join_room error:', e); }
    });

    socket.on('player_ready', async () => {
        try {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            if (room.status !== 'waiting') return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player || player.ready) return;

            const dbUser = await User.findOne({ telegramId: currentUser.telegramId });
            if (!dbUser) return;

            // Deduct the bet gift from player's inventory
            const invItem = dbUser.inventory.find(i => i.statueId === room.betGiftId);
            if (!invItem || invItem.count <= (invItem.listedInMarket || 0)) {
                socket.emit('error', `У вас нет подарка "${room.betGift.name}" для ставки!`);
                return;
            }

            invItem.count--;
            if (invItem.count <= 0) dbUser.inventory = dbUser.inventory.filter(i => i.statueId !== room.betGiftId);
            await dbUser.save();

            player.ready = true;
            player.paid = true;
            room.pot.push({ giftId: room.betGiftId, playerId: currentUser.telegramId });

            io.to(currentRoomId).emit('room_update', room);
            socket.emit('inventory_update', dbUser.inventory);

            // Creator-only: start if all ready (creator gets notification if not all ready)
            const isCreator = currentUser.telegramId === room.creator;
            const allReady = room.players.every(p => p.ready);
            const minPlayers = room.players.length >= 2;

            if (allReady && minPlayers) {
                await startPvPGame(room);
            }
        } catch (e) { console.error('player_ready error:', e); }
    });

    // Creator can force start if they want
    socket.on('force_start', async () => {
        try {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            if (room.creator !== currentUser.telegramId) {
                socket.emit('error', 'Только создатель может начать игру'); return;
            }
            if (room.status !== 'waiting') return;
            const readyPlayers = room.players.filter(p => p.ready);
            const notReady = room.players.filter(p => !p.ready).map(p => p.user.username);
            if (readyPlayers.length < 2) {
                socket.emit('error', 'Нужно хотя бы 2 готовых игрока'); return;
            }
            if (notReady.length > 0) {
                socket.emit('not_all_ready', { notReady });
                return;
            }
            await startPvPGame(room);
        } catch (e) { console.error('force_start error:', e); }
    });

    socket.on('leave_room', () => { _leaveCurrentRoom(); socket.emit('left_room'); });
    socket.on('disconnect', () => { _leaveCurrentRoom(); io.to('global_lobby').emit('online_count', io.engine.clientsCount); });

    function _leaveCurrentRoom() {
        if (!currentRoomId || !rooms[currentRoomId]) { currentRoomId = null; return; }
        const room = rooms[currentRoomId];
        // Return gift if already paid but game hasn't started
        if (room.status === 'waiting') {
            const player = room.players.find(p => p.socketId === socket.id);
            if (player?.paid && currentUser) {
                User.findOne({ telegramId: currentUser.telegramId }).then(u => {
                    if (u) {
                        const inv = u.inventory.find(i => i.statueId === room.betGiftId);
                        if (inv) inv.count++; else u.inventory.push({ statueId: room.betGiftId, count: 1 });
                        u.save();
                    }
                });
            }
        }
        room.players = room.players.filter(p => p.socketId !== socket.id);
        if (currentUser) delete room.playerColors[currentUser.telegramId];
        if (room.players.length === 0) delete rooms[currentRoomId];
        else io.to(currentRoomId).emit('room_update', room);
        io.to('global_lobby').emit('update_rooms', getPublicRooms());
        socket.leave(currentRoomId);
        currentRoomId = null;
    }
});

// ── PvP GAME LOGIC ─────────────────────────────────────────────────────────

async function startPvPGame(room) {
    try {
        room.status = 'playing';
        const stopAngle = Math.floor(Math.random() * 360);

        // Only use players who are ready (paid)
        const activePlayers = room.players.filter(p => p.ready);

        io.to(room.id).emit('game_start', {
            pot: activePlayers.length,
            potGift: room.betGift,
            players: activePlayers,
            playerColors: room.playerColors,
            stopAngle
        });

        setTimeout(async () => {
            try {
                const winnerIndex = Math.floor(Math.random() * activePlayers.length);
                const winner = activePlayers[winnerIndex];

                const dbWinner = await User.findOne({ telegramId: winner.user.telegramId });
                if (dbWinner) {
                    // Winner gets all gifts from pot
                    const wonCount = activePlayers.length;
                    const inv = dbWinner.inventory.find(i => i.statueId === room.betGiftId);
                    if (inv) inv.count += wonCount; else dbWinner.inventory.push({ statueId: room.betGiftId, count: wonCount });
                    dbWinner.stats.wins++;
                    dbWinner.stats.games++;
                    dbWinner.stats.lastGames.push({ date: new Date(), type: 'pvp', result: 'win', amount: wonCount, giftId: room.betGiftId });
                    if (dbWinner.stats.lastGames.length > 10) dbWinner.stats.lastGames = dbWinner.stats.lastGames.slice(-10);
                    dbWinner.updateRank();
                    await dbWinner.save();
                }

                for (const player of activePlayers) {
                    if (player.user.telegramId !== winner.user.telegramId) {
                        const loser = await User.findOne({ telegramId: player.user.telegramId });
                        if (loser) {
                            loser.stats.games++;
                            loser.stats.lastGames.push({ date: new Date(), type: 'pvp', result: 'loss', amount: -1, giftId: room.betGiftId });
                            if (loser.stats.lastGames.length > 10) loser.stats.lastGames = loser.stats.lastGames.slice(-10);
                            loser.updateRank();
                            await loser.save();
                        }
                    }
                }

                io.to(room.id).emit('game_over', {
                    winner: { ...winner.user, color: room.playerColors[winner.user.telegramId] },
                    wonCount: activePlayers.length,
                    betGift: room.betGift,
                    playerColors: room.playerColors
                });

                if (dbWinner) {
                    io.to(room.id).emit('pvp_inventory_update', {
                        telegramId: winner.user.telegramId,
                        newInventory: dbWinner.inventory
                    });
                }

                setTimeout(() => {
                    delete rooms[room.id];
                    io.to('global_lobby').emit('update_rooms', getPublicRooms());
                }, 10000);

            } catch (e) { console.error('PvP completion error:', e); }
        }, 7000);

    } catch (e) { console.error('startPvPGame error:', e); }
}

function getPublicRooms() {
    return Object.values(rooms)
        .filter(r => r.status === 'waiting')
        .map(r => ({
            id: r.id, betGift: r.betGift, maxPlayers: r.maxPlayers,
            players: r.players.length,
            creator: r.players[0]?.user?.username || 'Unknown',
            creatorRank: r.players[0]?.user?.rank || 'Новичок',
            creatorColor: r.players[0]?.user?.color || '#8e8e93'
        }));
}

// Expose gifts list to client
app.get('/api/gifts', (req, res) => res.json(GIFTS));

process.on('uncaughtException',  err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));
server.listen(PORT, () => console.log(`🚀 SPINS Server running on port ${PORT}`));
