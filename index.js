require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./db');

const bot = new Telegraf(process.env.BOT_TOKEN);

function mainMenu() {
    return Markup.keyboard([
        ['🏋️ Category'],
        ['🎯 Find Partner'],
        ['🛑 Stop Chat', '🔄 Next Person']
    ]).resize();
}

function categoryMenu() {
    return Markup.keyboard([
        ['🏋️ Gym', '☕ Cafe'],
        ['🚬 Smoke', '🎮 Gaming'],
        ['🔙 Back']
    ]).resize();
}

bot.start(async (ctx) => {

    console.log('***ctx',ctx)

    const user = ctx.from;

    await db.query(`
        INSERT IGNORE INTO users
        (telegram_id, username, first_name)
        VALUES (?, ?, ?)
    `, [
        user.id,
        user.username || '',
        user.first_name || ''
    ]);

    ctx.reply(
        `Welcome ${user.first_name}`,
        mainMenu()
    );
});

bot.hears('🏋️ Category', (ctx) => {
    ctx.reply('Choose category:', categoryMenu());
});

bot.hears(
    ['🏋️ Gym', '☕ Cafe', '🚬 Smoke', '🎮 Gaming'],
    async (ctx) => {

        const category =
            ctx.message.text.replace(/[^\w]/g, '').trim();

        await db.query(
            `UPDATE users SET category=? WHERE telegram_id=?`,
            [category, ctx.from.id]
        );

        ctx.reply(
            `Category set: ${category}`,
            mainMenu()
        );
    });

bot.hears('🔙 Back', (ctx) => {
    ctx.reply('Main menu', mainMenu());
});

bot.hears('🎯 Find Partner', async (ctx) => {

    const myId = ctx.from.id;

    const [meRows] = await db.query(
        `SELECT * FROM users WHERE telegram_id=?`,
        [myId]
    );

    const me = meRows[0];

    if (!me.category)
        return ctx.reply('Select category first.');

    const [rows] = await db.query(`
        SELECT * FROM users
        WHERE category=?
        AND telegram_id != ?
        AND status='waiting'
        LIMIT 1
    `, [me.category, myId]);

    if (rows.length === 0) {

        await db.query(
            `UPDATE users SET status='waiting' WHERE telegram_id=?`,
            [myId]
        );

        return ctx.reply('Searching...');
    }

    const partner = rows[0];

    await db.query(`
        UPDATE users
        SET status='chatting', partner_id=?
        WHERE telegram_id=?
    `, [partner.telegram_id, myId]);

    await db.query(`
        UPDATE users
        SET status='chatting', partner_id=?
        WHERE telegram_id=?
    `, [myId, partner.telegram_id]);

    ctx.reply('Matched! Start chatting.', mainMenu());

    bot.telegram.sendMessage(
        partner.telegram_id,
        'Matched! Start chatting.'
    );
});

bot.hears('🛑 Stop Chat', async (ctx) => {

    const myId = ctx.from.id;

    const [rows] = await db.query(
        `SELECT * FROM users WHERE telegram_id=?`,
        [myId]
    );

    const me = rows[0];

    await db.query(`
        UPDATE users
        SET status='idle', partner_id=NULL
        WHERE telegram_id IN (?,?)
    `, [myId, me.partner_id]);

    ctx.reply('Chat ended.', mainMenu());

    if (me.partner_id) {
        bot.telegram.sendMessage(
            me.partner_id,
            'Partner left chat.'
        );
    }
});

bot.on('text', async (ctx) => {

    const txt = ctx.message.text;

    const buttons = [
        '🏋️ Category',
        '🎯 Find Partner',
        '🛑 Stop Chat',
        '🔄 Next Person',
        '🔙 Back',
        '🏋️ Gym',
        '☕ Cafe',
        '🚬 Smoke',
        '🎮 Gaming'
    ];

    if (buttons.includes(txt)) return;

    const [rows] = await db.query(
        `SELECT * FROM users WHERE telegram_id=?`,
        [ctx.from.id]
    );

    const me = rows[0];

    if (me.status !== 'chatting') return;

    bot.telegram.sendMessage(
        me.partner_id,
        txt
    );
});

bot.launch();
console.log('Bot running...');