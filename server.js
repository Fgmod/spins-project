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

// --- КОНФИГУРАЦИЯ ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://makarychev887_db_user:VjHYgC26wBnnmMUW@cluster0.omk9t2w.mongodb.net/?appName=Cluster0';
const BOT_TOKEN = process.env.BOT_TOKEN || '7904673285:AAFWIngrdaMhM47g8bmBFG4rv45zUfbS05A';
const ADMIN_ID = 1743237033;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- ПОДКЛЮЧЕНИЕ К MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const bot = new Telegraf(BOT_TOKEN);

// --- РАНГИ И ЛИГИ ---
const RANKS = [
    { name: 'Новичок', minBalance: 0, color: '#8e8e93', icon: '🌱', wheelGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { name: 'Лудоман', minBalance: 5000, color: '#29b6f6', icon: '🎲', wheelGradient: 'linear-gradient(135deg, #29b6f6 0%, #0288d1 100%)' },
    { name: 'Инвестор', minBalance: 25000, color: '#ffd700', icon: '💎', wheelGradient: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)' },
    { name: 'Шейх', minBalance: 100000, color: '#ff2d55', icon: '👑', wheelGradient: 'linear-gradient(135deg, #ff2d55 0%, #c41e3a 100%)' }
];

// --- КОЛЛЕКЦИОННЫЕ СТАТУИ (GACHA) ---
const STATUES = [
    { id: 'gold_durov', name: 'Золотой Дуров', rarity: 'rare', emoji: '👑', dropRate: 2, bonus: 0.5, image: 'https://i.imgur.com/golden.png' },
    { id: 'diamond_hamster', name: 'Алмазный Хомяк', rarity: 'epic', emoji: '🐹', dropRate: 1.5, bonus: 1.0, image: 'https://i.imgur.com/diamond.png' },
    { id: 'prison_steve', name: 'Тюремный Стив', rarity: 'common', emoji: '⛓️', dropRate: 5, bonus: 0.2, image: 'https://i.imgur.com/prison.png' },
    { id: 'ton_king', name: 'TON Король', rarity: 'legendary', emoji: '⚡', dropRate: 0.5, bonus: 2.5, image: 'https://i.imgur.com/king.png' },
    { id: 'crypto_wolf', name: 'Крипто Волк', rarity: 'epic', emoji: '🐺', dropRate: 1, bonus: 1.2, image: 'https://i.imgur.com/wolf.png' }
];

// Схема пользователя
const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    balance: { type: Number, default: 1000 },
    inventory: [{
        statueId: String,
        count: { type: Number, default: 1 }
    }],
    completedCollections: [String],
    stats: { 
        wins: { type: Number, default: 0 }, 
        games: { type: Number, default: 0 },
        totalWon: { type: Number, default: 0 },
        lastGames: [{
            date: Date,
            type: String,
            result: String,
            amount: Number
        }]
    },
    rank: { type: String, default: 'Новичок' },
    rankColor: { type: String, default: '#8e8e93' }
});

UserSchema.methods.updateRank = function() {
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (this.balance >= RANKS[i].minBalance) {
            this.rank = RANKS[i].name;
            this.rankColor = RANKS[i].color;
            break;
        }
    }
    return this.rank;
};

UserSchema.methods.getCollectionBonus = function() {
    let bonus = 1.0;
    this.completedCollections.forEach(collection => {
        const statue = STATUES.find(s => s.id === collection);
        if (statue) bonus += statue.bonus / 100;
    });
    return bonus;
};

const User = mongoose.model('User', UserSchema);

// --- ТЕЛЕГРАМ БОТ (АДМИН-ПАНЕЛЬ) ---
const isAdmin = (ctx) => ctx.from.id === ADMIN_ID;

bot.start((ctx) => {
    ctx.reply(`Добро пожаловать в SPINS! Нажми на кнопку "Menu", чтобы начать.`);
});

bot.command('stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    try {
        const allUsers = await User.find().sort({ balance: -1 });
        
        let msg = `<b>📊 ПОЛНЫЙ СПИСОК ИГРОКОВ:</b>\n\n`;
        
        allUsers.forEach((u, i) => {
            const isOnline = Array.from(io.sockets.sockets.values()).some(s => s.userId === u.telegramId);
            const status = isOnline ? "🟢 Online" : "🔴 Offline";
            
            const safeName = (u.username || u.firstName || 'Unknown')
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            msg += `${i + 1}. ${safeName} | <code>${u.telegramId}</code> | <b>${u.balance.toFixed(2)} TON</b> | ${status} | Ранг: ${u.rank}\n`;
        });

        if (msg.length > 4000) {
            await ctx.replyWithHTML(msg.substring(0, 4000));
            await ctx.replyWithHTML(msg.substring(4000));
        } else {
            await ctx.replyWithHTML(msg);
        }
    } catch (err) {
        console.error("Ошибка в команде stats:", err);
        ctx.reply("Произошла ошибка при формировании статистики.");
    }
});

bot.command('check', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const targetId = ctx.message.text.split(' ')[1];
    if (!targetId) return ctx.reply('Введите ID: /check 12345678');

    const u = await User.findOne({ telegramId: targetId });
    if (!u) return ctx.reply('Игрок не найден в базе.');

    ctx.replyWithMarkdown(
        `👤 **Игрок:** ${u.username || u.firstName}\n` +
        `🆔 **ID:** \`${u.telegramId}\`\n` +
        `💎 **Баланс:** ${u.balance.toFixed(2)} TON\n` +
        `🏆 **Ранг:** ${u.rank}\n` +
        `🎮 **Игр:** ${u.stats.games} | **Побед:** ${u.stats.wins}\n` +
        `📦 **Статуй:** ${u.inventory.length}`
    );
});

bot.command('give', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const [_, targetId, amountStr] = ctx.message.text.split(' ');
    const amount = parseFloat(amountStr);

    if (!targetId || isNaN(amount)) {
        return ctx.reply('Формат: /give [ID] [Сумма]\nПример: /give 1743237033 500');
    }

    const u = await User.findOneAndUpdate(
        { telegramId: targetId },
        { $inc: { balance: amount } },
        { new: true }
    );

    if (!u) return ctx.reply('Игрок не найден.');
    
    u.updateRank();
    await u.save();

    io.emit('balance_update_global', { telegramId: u.telegramId, newBalance: u.balance, newRank: u.rank });
    
    ctx.reply(`✅ Баланс игрока ${u.username || u.firstName} изменен на ${amount}. \nНовый баланс: ${u.balance.toFixed(2)} TON, Ранг: ${u.rank}`);
});

bot.launch();

// --- ИГРОВЫЕ КОМНАТЫ (PvP) ---
let rooms = {};

// --- API ROUTES ---
app.post('/api/auth', async (req, res) => {
    const { id, username, first_name } = req.body;
    try {
        let user = await User.findOne({ telegramId: id });
        if (!user) {
            user = new User({ 
                telegramId: id, 
                username, 
                firstName: first_name,
                rank: id === ADMIN_ID ? 'Шейх' : 'Новичок',
                rankColor: id === ADMIN_ID ? '#ff2d55' : '#8e8e93'
            });
            await user.save();
        }
        
        user.updateRank();
        await user.save();
        
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/bot-game', async (req, res) => {
    const { id, bet } = req.body;
    
    const user = await User.findOne({ telegramId: id });
    if (!user || user.balance < bet) return res.json({ error: "Недостаточно средств" });

    user.balance -= bet;

    // Создаем ботов с цветами
    const botNames = ['Alex', 'Maria', 'John', 'Emma', 'Mike', 'Sarah'];
    const botColors = ['#FF2D55', '#007AFF', '#34C759', '#FF9500', '#9D4EDD', '#FFD700'];
    
    const bots = [];
    for (let i = 0; i < 5; i++) {
        bots.push({
            name: botNames[Math.floor(Math.random() * botNames.length)],
            color: botColors[Math.floor(Math.random() * botColors.length)],
            bet: bet
        });
    }
    
    const totalPot = bet * (bots.length + 1);
    
    // Повышаем шанс выигрыша до 40%
    const participants = [user, ...bots];
    const userWinChance = 0.4;
    
    let winner;
    if (Math.random() < userWinChance) {
        winner = user;
    } else {
        winner = bots[Math.floor(Math.random() * bots.length)];
    }
    
    const isWin = winner === user;
    let winAmount = 0;

    if (isWin) {
        winAmount = totalPot;
        const collectionBonus = user.getCollectionBonus();
        winAmount = Math.floor(winAmount * collectionBonus);
        
        user.balance += winAmount;
        user.stats.wins++;
        user.stats.totalWon += winAmount;
    }

    // Шанс 5% на выпадение статуи
    if (!isWin && Math.random() < 0.05) {
        const randomStatue = STATUES[Math.floor(Math.random() * STATUES.length)];
        const existingItem = user.inventory.find(i => i.statueId === randomStatue.id);
        
        if (existingItem) {
            existingItem.count++;
        } else {
            user.inventory.push({ statueId: randomStatue.id, count: 1 });
        }
        
        // Проверка на завершение коллекции
        const collectionStatues = STATUES.map(s => s.id);
        const hasAll = collectionStatues.every(statueId => 
            user.inventory.some(i => i.statueId === statueId && i.count > 0)
        );
        
        if (hasAll && !user.completedCollections.includes('all')) {
            user.completedCollections.push('all');
        }
    }

    user.stats.games++;
    user.stats.lastGames.push({
        date: new Date(),
        type: 'bot',
        result: isWin ? 'win' : 'loss',
        amount: isWin ? winAmount : -bet
    });
    
    if (user.stats.lastGames.length > 10) {
        user.stats.lastGames.shift();
    }

    user.updateRank();
    await user.save();

    res.json({
        isWin,
        winner: winner.name || winner.username,
        winnerColor: winner.color || user.rankColor,
        pot: totalPot,
        newBalance: user.balance,
        participants: participants.map(p => ({
            name: p.name || p.username,
            color: p.color || p.rankColor
        })),
        stopAngle: Math.floor(Math.random() * 360),
        newRank: user.rank,
        droppedStatue: !isWin && Math.random() < 0.05 ? randomStatue : null
    });
});

app.get('/api/market', async (req, res) => {
    try {
        const users = await User.find();
        const marketItems = [];
        
        users.forEach(user => {
            user.inventory.forEach(item => {
                const statue = STATUES.find(s => s.id === item.statueId);
                if (statue && item.count > 0) {
                    marketItems.push({
                        id: `${user.telegramId}_${statue.id}`,
                        sellerId: user.telegramId,
                        sellerName: user.username || user.firstName,
                        statue: statue,
                        count: item.count,
                        price: Math.floor(100 * (statue.rarity === 'legendary' ? 10 : statue.rarity === 'epic' ? 5 : 2))
                    });
                }
            });
        });
        
        res.json(marketItems);
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
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
        
        buyer.balance -= price;
        seller.balance += price;
        
        sellerItem.count--;
        if (sellerItem.count === 0) {
            seller.inventory = seller.inventory.filter(i => i.statueId !== statueId);
        }
        
        const buyerItem = buyer.inventory.find(i => i.statueId === statueId);
        if (buyerItem) {
            buyerItem.count++;
        } else {
            buyer.inventory.push({ statueId, count: 1 });
        }
        
        await buyer.save();
        await seller.save();
        await session.commitTransaction();
        
        res.json({ success: true, newBalance: buyer.balance });
    } catch (e) {
        await session.abortTransaction();
        res.status(400).json({ error: e.message });
    } finally {
        session.endSession();
    }
});

// --- SOCKET.IO PVP ЛОГИКА ---
io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentUser = null;

    socket.on('login', async (userData) => {
        currentUser = userData;
        socket.join('global_lobby');
        io.to('global_lobby').emit('online_count', io.engine.clientsCount);
    });

    socket.on('create_room', async (betAmount) => {
        const user = await User.findOne({ telegramId: currentUser.telegramId });
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        
        const playerColor = user.rank === 'Шейх' ? '#ff2d55' : 
                           user.rank === 'Инвестор' ? '#ffd700' :
                           user.rank === 'Лудоман' ? '#29b6f6' : '#8e8e93';
        
        rooms[roomId] = {
            id: roomId,
            creator: currentUser.telegramId,
            bet: betAmount,
            players: [{
                socketId: socket.id,
                user: {
                    ...currentUser,
                    rank: user.rank,
                    rankColor: user.rankColor,
                    color: playerColor
                },
                ready: false
            }],
            pot: 0,
            status: 'waiting',
            playerColors: {}
        };
        
        rooms[roomId].playerColors[currentUser.telegramId] = playerColor;
        currentRoomId = roomId;
        socket.join(roomId);
        socket.emit('room_joined', rooms[roomId]);
        io.to('global_lobby').emit('update_rooms', getPublicRooms());
    });

    socket.on('get_rooms', () => {
        socket.emit('update_rooms', getPublicRooms());
    });

    socket.on('join_room', async (roomId) => {
        const room = rooms[roomId];
        const user = await User.findOne({ telegramId: currentUser.telegramId });
        
        if (room && room.status === 'waiting' && room.players.length < 6) {
            const playerColor = user.rank === 'Шейх' ? '#ff2d55' : 
                               user.rank === 'Инвестор' ? '#ffd700' :
                               user.rank === 'Лудоман' ? '#29b6f6' : '#8e8e93';
            
            room.players.push({
                socketId: socket.id,
                user: {
                    ...currentUser,
                    rank: user.rank,
                    rankColor: user.rankColor,
                    color: playerColor
                },
                ready: false
            });
            
            room.playerColors[currentUser.telegramId] = playerColor;
            currentRoomId = roomId;
            socket.join(roomId);
            io.to(roomId).emit('room_update', room);
            io.to('global_lobby').emit('update_rooms', getPublicRooms());
        } else {
            socket.emit('error', 'Комната полна или игра уже идет');
        }
    });

    socket.on('player_ready', async () => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];
        
        const dbUser = await User.findOne({ telegramId: currentUser.telegramId });
        if (dbUser.balance < room.bet) {
            socket.emit('error', 'Недостаточно денег для ставки!');
            return;
        }

        dbUser.balance -= room.bet;
        await dbUser.save();

        const player = room.players.find(p => p.socketId === socket.id);
        player.ready = true;
        room.pot += room.bet;

        io.to(currentRoomId).emit('room_update', room);
        socket.emit('balance_update', dbUser.balance);

        if (room.players.length >= 2 && room.players.every(p => p.ready)) {
            startPvPGame(room);
        }
    });

    socket.on('leave_room', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            room.players = room.players.filter(p => p.socketId !== socket.id);
            delete room.playerColors[currentUser?.telegramId];
            
            if (room.players.length === 0) {
                delete rooms[currentRoomId];
            } else {
                io.to(currentRoomId).emit('room_update', room);
            }
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
            
            if (room.players.length === 0) {
                delete rooms[currentRoomId];
            } else {
                io.to(currentRoomId).emit('room_update', room);
            }
            io.to('global_lobby').emit('update_rooms', getPublicRooms());
        }
    });
});

async function startPvPGame(room) {
    room.status = 'playing';
    io.to(room.id).emit('game_start', { pot: room.pot, players: room.players });

    setTimeout(async () => {
        const winnerIndex = Math.floor(Math.random() * room.players.length);
        const winner = room.players[winnerIndex];
        
        const dbWinner = await User.findOne({ telegramId: winner.user.telegramId });
        dbWinner.balance += room.pot;
        dbWinner.stats.wins++;
        dbWinner.stats.totalWon += room.pot;
        dbWinner.stats.lastGames.push({
            date: new Date(),
            type: 'pvp',
            result: 'win',
            amount: room.pot
        });
        
        dbWinner.updateRank();
        await dbWinner.save();

        const loserUpdates = [];
        room.players.forEach(async (p) => {
            if (p.user.telegramId !== winner.user.telegramId) {
                const loser = await User.findOne({ telegramId: p.user.telegramId });
                if (loser) {
                    loser.stats.lastGames.push({
                        date: new Date(),
                        type: 'pvp',
                        result: 'loss',
                        amount: -room.bet
                    });
                    loser.updateRank();
                    loserUpdates.push(loser.save());
                }
            }
        });
        
        await Promise.all(loserUpdates);

        io.to(room.id).emit('game_over', {
            winner: {
                ...winner.user,
                color: room.playerColors[winner.user.telegramId]
            },
            prize: room.pot,
            playerColors: room.playerColors
        });

        setTimeout(() => {
            delete rooms[room.id];
            io.to('global_lobby').emit('update_rooms', getPublicRooms());
        }, 5000);

    }, 5000);
}

function getPublicRooms() {
    return Object.values(rooms)
        .filter(r => r.status === 'waiting')
        .map(r => ({ 
            id: r.id, 
            bet: r.bet, 
            players: r.players.length, 
            creator: r.players[0].user.username,
            creatorRank: r.players[0].user.rank
        }));
}

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
