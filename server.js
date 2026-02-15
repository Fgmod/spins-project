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
// Вставь сюда свою строку от MongoDB Atlas, если запускаешь локально, или используй .env
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://makarychev887_db_user:VjHYgC26wBnnmMUW@cluster0.omk9t2w.mongodb.net/?appName=Cluster0'; 
const BOT_TOKEN = process.env.BOT_TOKEN || '7904673285:AAFWIngrdaMhM47g8bmBFG4rv45zUfbS05A';
const ADMIN_ID = 1743237033; // Твой ID

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- ПОДКЛЮЧЕНИЕ К MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const bot = new Telegraf(BOT_TOKEN);

// --- АДМИН-ПАНЕЛЬ В ЧАТЕ ---

// Проверка на админа
const isAdmin = (ctx) => ctx.from.id === ADMIN_ID;

// Старт 
bot.command('start', async(ctx) => {
    ctx.reply("Добро пожаловать в игру SPINS! Нажмите кнопку ниже, чтобы начать.", {
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 Играть сейчас", web_app: { url: "https://spins-project-167y.onrender.com" } }]]
        }
    });
});

// 1. Общая статистика: /stats
bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const count = await User.countDocuments();
    const topUsers = await User.find().sort({ balance: -1 }).limit(5);
    
    let msg = `📊 **Общая статистика игры**\n\n`;
    msg += `👥 Всего игроков: ${count}\n`;
    msg += `🌐 Онлайн сейчас: ${io.engine.clientsCount}\n\n`;
    msg += `💰 **Топ-5 по балансу:**\n`;
    topUsers.forEach((u, i) => {
        msg += `${i+1}. ${u.username || u.firstName} (ID: \`${u.telegramId}\`): ${u.balance.toFixed(2)} TON\n`;
    });
    ctx.replyWithMarkdown(msg);
});

// 2. Проверка игрока: /check [ID]
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
        `🎮 **Игр:** ${u.stats.games} | **Побед:** ${u.stats.wins}`
    );
});

// 3. Выдача баланса: /give [ID] [Сумма]
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

    // Моментально обновляем баланс на экране у игрока через socket
    io.emit('balance_update_global', { telegramId: u.telegramId, newBalance: u.balance });
    
    ctx.reply(`✅ Баланс игрока ${u.username || u.firstName} изменен на ${amount}. \nНовый баланс: ${u.balance.toFixed(2)} TON`);
});

bot.launch();



// Схема пользователя
const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    balance: { type: Number, default: 1000 },
    inventory: [String], // Для картинок/призов
    stats: { wins: { type: Number, default: 0 }, games: { type: Number, default: 0 } }
});
const User = mongoose.model('User', UserSchema);

// --- ИГРОВЫЕ КОМНАТЫ (PvP) ---
let rooms = {}; // { roomId: { players: [], pot: 0, status: 'waiting' } }

// --- API ROUTES ---

// Авторизация / Создание профиля
app.post('/api/auth', async (req, res) => {
    const { id, username, first_name } = req.body;
    try {
        let user = await User.findOne({ telegramId: id });
        if (!user) {
            user = new User({ telegramId: id, username, firstName: first_name });
            await user.save();
        }
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Игра с ботами (Симуляция общего банка)
app.post('/api/bot-game', async (req, res) => {
    const { id, bet } = req.body;
    
    const user = await User.findOne({ telegramId: id });
    if (!user || user.balance < bet) return res.json({ error: "Недостаточно средств" });

    // Списываем ставку
    user.balance -= bet;

    // Логика ботов: 3 бота тоже ставят ставки
    const bots = [
        { name: "Bot Alex", bet: bet },
        { name: "Bot Maria", bet: bet },
        { name: "Bot John", bet: bet }
    ];
    
    const totalPot = bet * 4; // Банк (4 игрока по ставке)
    
    // Определяем победителя (Шанс 25% честный)
    const participants = [user.username, ...bots.map(b => b.name)];
    const winnerIndex = Math.floor(Math.random() * participants.length);
    const winnerName = participants[winnerIndex];
    const isWin = winnerIndex === 0; // 0 - это наш игрок

    let winAmount = 0;
    if (isWin) {
        winAmount = totalPot;
        user.balance += winAmount;
        user.stats.wins++;
    }
    user.stats.games++;
    await user.save();

    res.json({
        isWin,
        winner: winnerName,
        pot: totalPot,
        newBalance: user.balance,
        participants: participants,
        stopAngle: Math.floor(Math.random() * 360) // Для анимации
    });
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

    // 1. Создание комнаты
    socket.on('create_room', (betAmount) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            id: roomId,
            creator: currentUser.telegramId,
            bet: betAmount,
            players: [{ socketId: socket.id, user: currentUser, ready: false }],
            pot: 0,
            status: 'waiting'
        };
        currentRoomId = roomId;
        socket.join(roomId);
        socket.emit('room_joined', rooms[roomId]);
        io.to('global_lobby').emit('update_rooms', getPublicRooms());
    });

    // 2. Список комнат
    socket.on('get_rooms', () => {
        socket.emit('update_rooms', getPublicRooms());
    });

    // 3. Вход в комнату
    socket.on('join_room', (roomId) => {
        const room = rooms[roomId];
        if (room && room.status === 'waiting' && room.players.length < 6) { // Макс 6 игроков
            room.players.push({ socketId: socket.id, user: currentUser, ready: false });
            currentRoomId = roomId;
            socket.join(roomId);
            io.to(roomId).emit('room_update', room);
            io.to('global_lobby').emit('update_rooms', getPublicRooms());
        } else {
            socket.emit('error', 'Комната полна или игра уже идет');
        }
    });

    // 4. Готовность и Ставка
    socket.on('player_ready', async () => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];
        
        // Проверка баланса в БД
        const dbUser = await User.findOne({ telegramId: currentUser.telegramId });
        if (dbUser.balance < room.bet) {
            socket.emit('error', 'Недостаточно денег для ставки!');
            return;
        }

        // Списываем деньги
        dbUser.balance -= room.bet;
        await dbUser.save();

        // Обновляем статус в комнате
        const player = room.players.find(p => p.socketId === socket.id);
        player.ready = true;
        room.pot += room.bet;

        io.to(currentRoomId).emit('room_update', room);
        socket.emit('balance_update', dbUser.balance);

        // Если все готовы - старт
        if (room.players.every(p => p.ready) && room.players.length > 1) {
            startPvPGame(room);
        }
    });

    socket.on('disconnect', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            room.players = room.players.filter(p => p.socketId !== socket.id);
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
    io.to(room.id).emit('game_start', { pot: room.pot });

    // Крутим рулетку 4 секунды
    setTimeout(async () => {
        const winnerIndex = Math.floor(Math.random() * room.players.length);
        const winner = room.players[winnerIndex];
        
        // Начисляем выигрыш
        const dbWinner = await User.findOne({ telegramId: winner.user.telegramId });
        dbWinner.balance += room.pot;
        dbWinner.stats.wins++;
        await dbWinner.save();

        io.to(room.id).emit('game_over', {
            winner: winner.user,
            prize: room.pot
        });

        // Удаляем комнату после игры
        delete rooms[room.id];
        io.to('global_lobby').emit('update_rooms', getPublicRooms());

    }, 5000);
}

function getPublicRooms() {
    return Object.values(rooms)
        .filter(r => r.status === 'waiting')
        .map(r => ({ id: r.id, bet: r.bet, players: r.players.length, creator: r.players[0].user.username }));
}

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
