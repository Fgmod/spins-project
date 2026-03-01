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
    { name: 'Новичок', minBalance: 0, color: '#8e8e93', icon: '🌱' },
    { name: 'Лудоман', minBalance: 5000, color: '#29b6f6', icon: '🎲' },
    { name: 'Инвестор', minBalance: 25000, color: '#ffd700', icon: '💎' },
    { name: 'Шейх', minBalance: 100000, color: '#ff2d55', icon: '👑' }
];

const STATUES = [
    { id: 'gold_durov', name: 'Золотой Дуров', rarity: 'rare', emoji: '👑', dropRate: 2, bonus: 0.5 },
    { id: 'diamond_hamster', name: 'Алмазный Хомяк', rarity: 'epic', emoji: '🐹', dropRate: 1.5, bonus: 1.0 },
    { id: 'prison_steve', name: 'Тюремный Стив', rarity: 'common', emoji: '⛓️', dropRate: 5, bonus: 0.2 },
    { id: 'ton_king', name: 'TON Король', rarity: 'legendary', emoji: '⚡', dropRate: 0.5, bonus: 2.5 },
    { id: 'crypto_wolf', name: 'Крипто Волк', rarity: 'epic', emoji: '🐺', dropRate: 1, bonus: 1.2 }
];

const PLAYER_PALETTES = [
    ['#FF2D55', '#007AFF', '#34C759', '#FF9500', '#9D4EDD', '#FFD700'],
    ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'],
    ['#E63946', '#457B9D', '#2ECC71', '#F39C12', '#8E44AD', '#1ABC9C'],
];

const LastGameSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['bot', 'pvp'] },
    result: { type: String, enum: ['win', 'loss'] },
    amount: Number
}, { _id: false });

const InventoryItemSchema = new mongoose.Schema({
    statueId: String,
    count: { type: Number, default: 1 }
}, { _id: false });

const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    balance: { type: Number, default: 1000 },
    inventory: [InventoryItemSchema],
    completedCollections: [String],
    stats: {
        wins: { type: Number, default: 0 },
        games: { type: Number, default: 0 },
        totalWon: { type: Number, default: 0 },
        lastGames: [LastGameSchema]
    },
    rank: { type: String, default: 'Новичок' },
    rankColor: { type: String, default: '#8e8e93' }
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

UserSchema.methods.getCollectionBonus = function () {
    let bonus = 1.0;
    this.completedCollections.forEach(c => {
        const s = STATUES.find(st => st.id === c);
        if (s) bonus += s.bonus / 100;
    });
    return bonus;
};

const User = mongoose.model('User', UserSchema);

const isAdmin = (ctx) => ctx.from.id === ADMIN_ID;
bot.start((ctx) => ctx.reply('Добро пожаловать в SPINS!'));

bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
        const allUsers = await User.find().sort({ balance: -1 });
        let msg = `<b>📊 ИГРОКИ:</b>\n\n`;
        allUsers.forEach((u, i) => {
            const safeName = (u.username || u.firstName || 'Unknown').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
            msg += `${i + 1}. ${safeName} | <code>${u.telegramId}</code> | <b>${u.balance.toFixed(2)} TON</b> | ${u.rank}\n`;
        });
        if (msg.length > 4000) { await ctx.replyWithHTML(msg.slice(0, 4000)); await ctx.replyWithHTML(msg.slice(4000)); }
        else await ctx.replyWithHTML(msg);
    } catch { ctx.reply("Ошибка."); }
});

bot.command('give', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const [, targetId, amountStr] = ctx.message.text.split(' ');
    const amount = parseFloat(amountStr);
    if (!targetId || isNaN(amount)) return ctx.reply('Формат: /give [ID] [Сумма]');
    const u = await User.findOneAndUpdate({ telegramId: targetId }, { $inc: { balance: amount } }, { new: true });
    if (!u) return ctx.reply('Игрок не найден.');
    u.updateRank(); await u.save();
    io.emit('balance_update_global', { telegramId: u.telegramId, newBalance: u.balance, newRank: u.rank });
    ctx.reply(`✅ Выдано ${amount} TON → ${u.username || u.firstName}. Итог: ${u.balance.toFixed(2)} TON`);
});

bot.launch();

let rooms = {};

// AUTH
app.post('/api/auth', async (req, res) => {
    try {
        const { id, username, first_name } = req.body;
        if (!id) return res.status(400).json({ error: 'ID required' });
        let user = await User.findOne({ telegramId: id });
        if (!user) {
            user = new User({ telegramId: id, username: username || '', firstName: first_name || '', rank: id === ADMIN_ID ? 'Шейх' : 'Новичок', rankColor: id === ADMIN_ID ? '#ff2d55' : '#8e8e93' });
            await user.save();
        } else {
            if (username) user.username = username;
            if (first_name) user.firstName = first_name;
            user.updateRank(); await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

// BOT GAME
app.post('/api/bot-game', async (req, res) => {
    try {
        const { id, bet } = req.body;
        const user = await User.findOne({ telegramId: id });
        if (!user) return res.status(404).json({ error: "Пользователь не найден" });
        if (user.balance < bet) return res.json({ error: "Недостаточно средств" });

        user.balance -= bet;

        const botNames = ['Alex', 'Maria', 'John', 'Emma', 'Mike', 'Sarah', 'Ivan', 'Olga'];
        const palette = [...PLAYER_PALETTES[Math.floor(Math.random() * PLAYER_PALETTES.length)]];
        for (let i = palette.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [palette[i], palette[j]] = [palette[j], palette[i]]; }

        const botCount = 5;
        const bots = Array.from({ length: botCount }, (_, i) => ({
            name: botNames[Math.floor(Math.random() * botNames.length)] + (i > 0 ? i : ''),
            color: palette[i % palette.length]
        }));
        const userColor = palette[botCount % palette.length];
        const totalPot = bet * (bots.length + 1);

        let winner;
        if (Math.random() < 0.4) {
            winner = { name: user.username || user.firstName || 'You', color: userColor, isUser: true };
        } else {
            winner = { ...bots[Math.floor(Math.random() * bots.length)], isUser: false };
        }

        const isWin = winner.isUser;
        let winAmount = 0;
        if (isWin) {
            winAmount = Math.floor(totalPot * user.getCollectionBonus());
            user.balance += winAmount;
            user.stats.wins++;
            user.stats.totalWon += winAmount;
        }

        user.stats.lastGames.push({ date: new Date(), type: 'bot', result: isWin ? 'win' : 'loss', amount: isWin ? winAmount : -bet });
        if (user.stats.lastGames.length > 10) user.stats.lastGames = user.stats.lastGames.slice(-10);
        user.stats.games++;
        user.updateRank();

        let droppedStatue = null;
        if (Math.random() < 0.05) {
            const statue = STATUES[Math.floor(Math.random() * STATUES.length)];
            const item = user.inventory.find(i => i.statueId === statue.id);
            if (item) item.count++; else user.inventory.push({ statueId: statue.id, count: 1 });
            droppedStatue = statue;
            if (STATUES.every(s => user.inventory.some(i => i.statueId === s.id)) && !user.completedCollections.includes('all'))
                user.completedCollections.push('all');
        }

        await user.save();

        res.json({
            isWin, winner: winner.name, winnerColor: winner.color, pot: totalPot,
            newBalance: user.balance,
            participants: [{ name: user.username || user.firstName || 'You', color: userColor }, ...bots],
            stopAngle: Math.floor(Math.random() * 360),
            newRank: user.rank, droppedStatue,
            userColor
        });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
});

// MARKET
app.get('/api/market', async (req, res) => {
    try {
        const users = await User.find();
        const items = [];
        users.forEach(u => {
            u.inventory.forEach(item => {
                const statue = STATUES.find(s => s.id === item.statueId);
                if (statue && item.count > 0) {
                    items.push({
                        id: `${u.telegramId}_${statue.id}`,
                        sellerId: u.telegramId,
                        sellerName: u.username || u.firstName || 'Unknown',
                        statue, count: item.count,
                        price: Math.floor(100 * (statue.rarity === 'legendary' ? 10 : statue.rarity === 'epic' ? 5 : statue.rarity === 'rare' ? 3 : 2))
                    });
                }
            });
        });
        res.json(items);
    } catch { res.status(500).json({ error: 'Database error' }); }
});

app.post('/api/market/buy', async (req, res) => {
    const { buyerId, sellerId, statueId, price } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const buyer = await User.findOne({ telegramId: buyerId }).session(session);
        const seller = await User.findOne({ telegramId: sellerId }).session(session);
        if (!buyer || !seller) throw new Error('User not found');
        if (buyer.balance < price) throw new Error('Insufficient funds');
        const sellerItem = seller.inventory.find(i => i.statueId === statueId);
        if (!sellerItem || sellerItem.count < 1) throw new Error('Item not available');
        buyer.balance -= price; seller.balance += price;
        sellerItem.count--;
        if (sellerItem.count === 0) seller.inventory = seller.inventory.filter(i => i.statueId !== statueId);
        const buyerItem = buyer.inventory.find(i => i.statueId === statueId);
        if (buyerItem) buyerItem.count++; else buyer.inventory.push({ statueId, count: 1 });
        await buyer.save(); await seller.save();
        await session.commitTransaction();
        res.json({ success: true, newBalance: buyer.balance });
    } catch (e) {
        await session.abortTransaction();
        res.status(400).json({ error: e.message });
    } finally { session.endSession(); }
});

// SOCKET PVP
io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentUser = null;

    socket.on('login', async (userData) => {
        currentUser = userData;
        socket.userId = userData.telegramId;
        socket.join('global_lobby');
        io.to('global_lobby').emit('online_count', io.engine.clientsCount);
    });

    socket.on('create_room', async (betAmount) => {
        try {
            const user = await User.findOne({ telegramId: currentUser.telegramId });
            if (!user) return;
            const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
            const playerColor = PLAYER_PALETTES[0][0];
            rooms[roomId] = {
                id: roomId, creator: currentUser.telegramId, bet: betAmount,
                players: [{ socketId: socket.id, user: { telegramId: currentUser.telegramId, username: currentUser.username || currentUser.firstName || 'Player', rank: user.rank, rankColor: user.rankColor, color: playerColor }, ready: false }],
                pot: 0, status: 'waiting',
                playerColors: { [currentUser.telegramId]: playerColor }
            };
            currentRoomId = roomId;
            socket.join(roomId);
            socket.emit('room_joined', rooms[roomId]);
            io.to('global_lobby').emit('update_rooms', getPublicRooms());
        } catch (e) { console.error(e); }
    });

    socket.on('get_rooms', () => socket.emit('update_rooms', getPublicRooms()));

    socket.on('join_room', async (roomId) => {
        try {
            const room = rooms[roomId];
            if (!room) { socket.emit('error', 'Комната не найдена'); return; }
            const user = await User.findOne({ telegramId: currentUser.telegramId });
            if (!user) return;
            if (room.status === 'waiting' && room.players.length < 6) {
                const usedColors = Object.values(room.playerColors);
                const palette = PLAYER_PALETTES[0];
                const playerColor = palette.find(c => !usedColors.includes(c)) || palette[room.players.length % palette.length];
                room.players.push({ socketId: socket.id, user: { telegramId: currentUser.telegramId, username: currentUser.username || currentUser.firstName || 'Player', rank: user.rank, rankColor: user.rankColor, color: playerColor }, ready: false });
                room.playerColors[currentUser.telegramId] = playerColor;
                currentRoomId = roomId;
                socket.join(roomId);
                io.to(roomId).emit('room_update', room);
                io.to('global_lobby').emit('update_rooms', getPublicRooms());
            } else { socket.emit('error', 'Комната полна или игра уже идет'); }
        } catch (e) { console.error(e); }
    });

    socket.on('player_ready', async () => {
        try {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            const dbUser = await User.findOne({ telegramId: currentUser.telegramId });
            if (!dbUser) return;
            if (dbUser.balance < room.bet) { socket.emit('error', 'Недостаточно денег!'); return; }
            dbUser.balance -= room.bet; await dbUser.save();
            const player = room.players.find(p => p.socketId === socket.id);
            if (player) { player.ready = true; room.pot += room.bet; }
            io.to(currentRoomId).emit('room_update', room);
            socket.emit('balance_update', dbUser.balance);
            if (room.players.length >= 2 && room.players.every(p => p.ready)) await startPvPGame(room);
        } catch (e) { console.error(e); }
    });

    socket.on('leave_room', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            room.players = room.players.filter(p => p.socketId !== socket.id);
            delete room.playerColors[currentUser?.telegramId];
            if (room.players.length === 0) delete rooms[currentRoomId];
            else io.to(currentRoomId).emit('room_update', room);
            io.to('global_lobby').emit('update_rooms', getPublicRooms());
        }
        currentRoomId = null;
        socket.emit('left_room');
    });

    socket.on('disconnect', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            room.players = room.players.filter(p => p.socketId !== socket.id);
            delete room.playerColors[currentUser?.telegramId];
            if (room.players.length === 0) delete rooms[currentRoomId];
            else io.to(currentRoomId).emit('room_update', room);
            io.to('global_lobby').emit('update_rooms', getPublicRooms());
        }
    });
});

async function startPvPGame(room) {
    try {
        room.status = 'playing';
        const stopAngle = Math.floor(Math.random() * 360);
        io.to(room.id).emit('game_start', { pot: room.pot, players: room.players, playerColors: room.playerColors, stopAngle });

        setTimeout(async () => {
            try {
                const winnerIndex = Math.floor(Math.random() * room.players.length);
                const winner = room.players[winnerIndex];
                const dbWinner = await User.findOne({ telegramId: winner.user.telegramId });
                if (dbWinner) {
                    dbWinner.balance += room.pot;
                    dbWinner.stats.wins++;
                    dbWinner.stats.totalWon += room.pot;
                    dbWinner.stats.games++;
                    dbWinner.stats.lastGames.push({ date: new Date(), type: 'pvp', result: 'win', amount: room.pot });
                    if (dbWinner.stats.lastGames.length > 10) dbWinner.stats.lastGames = dbWinner.stats.lastGames.slice(-10);
                    dbWinner.updateRank(); await dbWinner.save();
                }
                for (const player of room.players) {
                    if (player.user.telegramId !== winner.user.telegramId) {
                        const loser = await User.findOne({ telegramId: player.user.telegramId });
                        if (loser) {
                            loser.stats.games++;
                            loser.stats.lastGames.push({ date: new Date(), type: 'pvp', result: 'loss', amount: -room.bet });
                            if (loser.stats.lastGames.length > 10) loser.stats.lastGames = loser.stats.lastGames.slice(-10);
                            loser.updateRank(); await loser.save();
                        }
                    }
                }
                io.to(room.id).emit('game_over', { winner: { ...winner.user, color: room.playerColors[winner.user.telegramId] }, prize: room.pot, playerColors: room.playerColors });
                if (dbWinner) io.to(room.id).emit('pvp_balance_update', { telegramId: winner.user.telegramId, newBalance: dbWinner.balance });
                setTimeout(() => { delete rooms[room.id]; io.to('global_lobby').emit('update_rooms', getPublicRooms()); }, 8000);
            } catch (e) { console.error(e); }
        }, 6000);
    } catch (e) { console.error(e); }
}

function getPublicRooms() {
    return Object.values(rooms).filter(r => r.status === 'waiting').map(r => ({
        id: r.id, bet: r.bet, players: r.players.length,
        creator: r.players[0]?.user?.username || 'Unknown',
        creatorRank: r.players[0]?.user?.rank || 'Новичок',
        creatorColor: r.players[0]?.user?.color || '#8e8e93'
    }));
}

process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
