require('dotenv').config();

const { HttpsProxyAgent } = require('https-proxy-agent');
const { Telegraf, Markup } = require('telegraf');
const db = require('./db');

const agent = new HttpsProxyAgent('http://127.0.0.1:10808');

const bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: {
        agent
    }
});

/* =========================
   Menus
========================= */

async function mainMenu(userId) {

    const [rows] = await db.query(
        `SELECT status FROM users WHERE telegram_id=?`,
        [userId]
    );

    const status = rows[0]?.status || 'idle';

    if (status === 'chatting') {
        return Markup.keyboard([
            ['🏋️ کجا میخوای بری؟'],
            ['🔄 نفر بعدی', '🛑 توقف چت'],
        ]).resize();
    }

    return Markup.keyboard([
        ['🏋️ کجا میخوای بری؟'],
        ['🎯 پارتنرمو پیدا کن'],
        ['👤 پروفایل']
    ]).resize();
}

function categoryMenu() {
    return Markup.keyboard([
        ['🏋️ باشگاه', '☕ کافه'],
        ['🚬 یه سیگاری بکشیم', '🎮 گیم‌نت'],
        ['🔙 برگشت']
    ]).resize();
}

/* =========================
   Start
========================= */

bot.start(async (ctx) => {

    const user = ctx.from;

    await db.query(`
        INSERT IGNORE INTO users
        (telegram_id, username, first_name, status)
        VALUES (?, ?, ?, 'idle')
    `, [
        user.id,
        user.username || '',
        user.first_name || ''
    ]);

    await ctx.reply(
        `سلام ${user.first_name} 👋\nبه ربات خوش اومدی.`,
        await mainMenu(user.id)
    );
});

/* =========================
   Category
========================= */

bot.hears('🏋️ کجا میخوای بری؟', async (ctx) => {

    await ctx.reply(
        'یکی از گزینه‌های زیر را انتخاب کن:',
        categoryMenu()
    );
});

bot.hears(
    [
        '🏋️ باشگاه',
        '☕ کافه',
        '🚬 یه سیگاری بکشیم',
        '🎮 گیم‌نت'
    ],
    async (ctx) => {

        const category = ctx.message.text;

        await db.query(
            `UPDATE users SET category=? WHERE telegram_id=?`,
            [category, ctx.from.id]
        );

        await ctx.reply(
            `✅ دسته‌بندی انتخاب شد:\n${category}`,
            await mainMenu(ctx.from.id)
        );
    }
);

bot.hears('🔙 برگشت', async (ctx) => {

    await ctx.reply(
        '🏠 منوی اصلی',
        await mainMenu(ctx.from.id)
    );
});

/* =========================
   Find Partner
========================= */

bot.hears('🎯 پارتنرمو پیدا کن', async (ctx) => {

    const myId = ctx.from.id;

    const [meRows] = await db.query(
        `SELECT * FROM users WHERE telegram_id=?`,
        [myId]
    );

    const me = meRows[0];

    if (!me) {
        return ctx.reply('خطا در دریافت اطلاعات کاربر.');
    }

    if (!me.category) {

        return ctx.reply(
            '⚠️ هنوز مقصدت رو انتخاب نکردی.\n\nلطفاً ابتدا از لیست زیر انتخاب کن که دوست داری کجا بری:',
            categoryMenu()
        );
    }

    if (
        me.status === 'waiting'
    ) {
        return ctx.reply(
            '🔎 در حال حاضر در صف انتظار هستی...'
        );
    }

    if (
        me.status === 'chatting'
    ) {
        return ctx.reply(
            '💬 در حال حاضر داخل یک گفتگو هستی.\nبرای تغییر مخاطب از دکمه «🔄 نفر بعدی» استفاده کن.'
        );
    }

    const [rows] = await db.query(`
        SELECT *
        FROM users
        WHERE category=?
        AND telegram_id != ?
        AND status='waiting'
        LIMIT 1
    `, [
        me.category,
        myId
    ]);

    if (rows.length === 0) {

        await db.query(
            `UPDATE users SET status='waiting' WHERE telegram_id=?`,
            [myId]
        );

        return ctx.reply(
            '🔎 در حال جستجوی پارتنر...'
        );
    }

    const partner = rows[0];

    await db.query(`
        UPDATE users
        SET status='chatting',
            partner_id=?
        WHERE telegram_id=?
    `, [
        partner.telegram_id,
        myId
    ]);

    await db.query(`
        UPDATE users
        SET status='chatting',
            partner_id=?
        WHERE telegram_id=?
    `, [
        myId,
        partner.telegram_id
    ]);

    await ctx.reply(
        '🎉 پارتنر پیدا شد!\nمی‌تونی گفتگو رو شروع کنی.',
        await mainMenu(myId)
    );

    await bot.telegram.sendMessage(
        partner.telegram_id,
        '🎉 پارتنر پیدا شد!\nمی‌تونی گفتگو رو شروع کنی.',
        {
            reply_markup: (
                await mainMenu(partner.telegram_id)
            ).reply_markup
        }
    );
});

/* =========================
   Stop Chat
========================= */

bot.hears('🛑 توقف چت', async (ctx) => {

    const myId = ctx.from.id;

    const [rows] = await db.query(
        `SELECT * FROM users WHERE telegram_id=?`,
        [myId]
    );

    const me = rows[0];

    if (!me || me.status !== 'chatting') {
        return ctx.reply(
            '⚠️ در حال حاضر داخل هیچ گفتگویی نیستی.'
        );
    }

    const partnerId = me.partner_id;

    await db.query(`
        UPDATE users
        SET status='idle',
            partner_id=NULL
        WHERE telegram_id=?
    `, [myId]);

    if (partnerId) {

        await db.query(`
            UPDATE users
            SET status='idle',
                partner_id=NULL
            WHERE telegram_id=?
        `, [partnerId]);

        try {

            await bot.telegram.sendMessage(
                partnerId,
                '❌ طرف مقابل گفتگو را ترک کرد.',
                {
                    reply_markup: (
                        await mainMenu(partnerId)
                    ).reply_markup
                }
            );

        } catch (err) {
            console.error(err);
        }
    }

    await ctx.reply(
        '❌ گفتگو پایان یافت.',
        await mainMenu(myId)
    );
});

/* =========================
   Next Partner
========================= */

bot.hears('🔄 نفر بعدی', async (ctx) => {

    const myId = ctx.from.id;

    const [meRows] = await db.query(
        `SELECT * FROM users WHERE telegram_id=?`,
        [myId]
    );

    const me = meRows[0];

    if (!me) {
        return;
    }

    if (!me.category) {

        return ctx.reply(
            '⚠️ هنوز مقصدت رو انتخاب نکردی.\n\nلطفاً ابتدا از لیست زیر انتخاب کن که دوست داری کجا بری:',
            categoryMenu()
        );
    }

    if (me.partner_id) {

        await db.query(`
            UPDATE users
            SET status='idle',
                partner_id=NULL
            WHERE telegram_id=?
        `, [me.partner_id]);

        try {

            await bot.telegram.sendMessage(
                me.partner_id,
                '🔄 طرف مقابل به سراغ نفر بعدی رفت.',
                {
                    reply_markup: (
                        await mainMenu(me.partner_id)
                    ).reply_markup
                }
            );

        } catch (err) {
            console.error(err);
        }
    }

    await db.query(`
        UPDATE users
        SET status='idle',
            partner_id=NULL
        WHERE telegram_id=?
    `, [myId]);

    const [partners] = await db.query(`
        SELECT *
        FROM users
        WHERE category=?
        AND telegram_id != ?
        AND status='waiting'
        LIMIT 1
    `, [
        me.category,
        myId
    ]);

    if (partners.length === 0) {

        await db.query(`
            UPDATE users
            SET status='waiting'
            WHERE telegram_id=?
        `, [myId]);

        return ctx.reply(
            '🔎 در حال جستجوی نفر بعدی...'
        );
    }

    const partner = partners[0];

    await db.query(`
        UPDATE users
        SET status='chatting',
            partner_id=?
        WHERE telegram_id=?
    `, [
        partner.telegram_id,
        myId
    ]);

    await db.query(`
        UPDATE users
        SET status='chatting',
            partner_id=?
        WHERE telegram_id=?
    `, [
        myId,
        partner.telegram_id
    ]);

    await ctx.reply(
        '🎉 پارتنر جدید پیدا شد!\nگفتگو را شروع کن.',
        await mainMenu(myId)
    );

    await bot.telegram.sendMessage(
        partner.telegram_id,
        '🎉 پارتنر جدید پیدا شد!\nگفتگو را شروع کن.',
        {
            reply_markup: (
                await mainMenu(partner.telegram_id)
            ).reply_markup
        }
    );
});

bot.hears('👤 پروفایل', async (ctx) => {

    const [rows] = await db.query(
        `SELECT * FROM users WHERE telegram_id=?`,
        [ctx.from.id]
    );

    const user = rows[0];

    // اگر پروفایل کامل است نمایش بده
    if (
        user.age &&
        user.city &&
        user.gender &&
        user.photo_file_id
    ) {

        return ctx.replyWithPhoto(
            user.photo_file_id,
            {
                caption:
                    `👤 نام: ${user.first_name}
🎂 سن: ${user.age}
🏙️ شهر: ${user.city}
⚧️ جنسیت: ${user.gender}`
            }
        );
    }

    // اگر پروفایل ناقص است ساخت پروفایل را شروع کن
    await db.query(
        `UPDATE users
         SET profile_step='name'
         WHERE telegram_id=?`,
        [ctx.from.id]
    );

    await ctx.reply(
        '👤 ساخت پروفایل\n\nلطفاً نام خود را وارد کن:'
    );

});

bot.on('message', async (ctx, next) => {

    const [rows] = await db.query(
        `SELECT * FROM users WHERE telegram_id=?`,
        [ctx.from.id]
    );

    const user = rows[0];

    if (!user?.profile_step)
        return next();

    // مرحله نام
    if (user.profile_step === 'name') {

        if (!ctx.message.text) {
            return ctx.reply('لطفاً نام را به صورت متنی ارسال کن.');
        }

        await db.query(
            `UPDATE users
             SET first_name=?, profile_step='age'
             WHERE telegram_id=?`,
            [ctx.message.text, ctx.from.id]
        );

        return ctx.reply(
            '🎂 سنت چند ساله؟'
        );
    }

    // مرحله سن
    if (user.profile_step === 'age') {

        const age = parseInt(ctx.message.text);

        if (isNaN(age) || age < 10 || age > 100) {
            return ctx.reply(
                'سن معتبر وارد کن.'
            );
        }

        await db.query(
            `UPDATE users
             SET age=?, profile_step='city'
             WHERE telegram_id=?`,
            [age, ctx.from.id]
        );

        return ctx.reply(
            '🏙️ شهر محل سکونتت چیه؟'
        );
    }

    // مرحله شهر
    if (user.profile_step === 'city') {

        await db.query(
            `UPDATE users
             SET city=?, profile_step='gender'
             WHERE telegram_id=?`,
            [ctx.message.text, ctx.from.id]
        );

        return ctx.reply(
            '⚧️ جنسیتت رو انتخاب کن:',
            Markup.keyboard([
                ['👨 مرد'],
                ['👩 زن']
            ]).resize()
        );
    }

    // مرحله جنسیت
    if (user.profile_step === 'gender') {

        const gender = ctx.message.text;

        if (
            gender !== '👨 مرد' &&
            gender !== '👩 زن'
        ) {
            return ctx.reply(
                'یکی از گزینه‌ها را انتخاب کن.'
            );
        }

        await db.query(
            `UPDATE users
             SET gender=?, profile_step='photo'
             WHERE telegram_id=?`,
            [gender, ctx.from.id]
        );

        return ctx.reply(
            '📸 حالا یک عکس از خودت ارسال کن.'
        );
    }

    // مرحله عکس
    if (user.profile_step === 'photo') {

        if (!ctx.message.photo) {
            return ctx.reply(
                'لطفاً یک عکس ارسال کن.'
            );
        }

        const photo =
            ctx.message.photo[
            ctx.message.photo.length - 1
            ];

        await db.query(
            `UPDATE users
             SET photo_file_id=?,
                 profile_step=NULL
             WHERE telegram_id=?`,
            [photo.file_id, ctx.from.id]
        );

        return ctx.reply(
            '✅ پروفایل با موفقیت ذخیره شد.',
            await mainMenu(ctx.from.id)
        );
    }
});


/* =========================
   Forward Messages
========================= */

bot.on('message', async (ctx) => {

    const [rows] = await db.query(
        `SELECT * FROM users WHERE telegram_id=?`,
        [ctx.from.id]
    );

    const me = rows[0];

    if (!me) return;

    if (
        me.status !== 'chatting' ||
        !me.partner_id
    ) {
        return;
    }

    // جلوگیری از ارسال دکمه‌ها
    if (ctx.message.text) {

        const buttons = [
            '🏋️ کجا میخوای بری؟',
            '🎯 پارتنرمو پیدا کن',
            '🛑 توقف چت',
            '🔄 نفر بعدی',
            '🔙 برگشت',
            '🏋️ باشگاه',
            '☕ کافه',
            '🚬 یه سیگاری بکشیم',
            '🎮 گیم‌نت',
            '👤 پروفایل'
        ];

        if (buttons.includes(ctx.message.text)) {
            return;
        }
    }

    try {

        // فوروارد مستقیم هر نوع پیام
        await bot.telegram.copyMessage(
            me.partner_id,
            ctx.chat.id,
            ctx.message.message_id
        );

    } catch (err) {

        console.error(err);

        await db.query(`
            UPDATE users
            SET status='idle',
                partner_id=NULL
            WHERE telegram_id=?
        `, [ctx.from.id]);

        await ctx.reply(
            '⚠️ ارتباط با طرف مقابل قطع شده است.',
            await mainMenu(ctx.from.id)
        );
    }
});

/* =========================
   Launch
========================= */

bot.launch();

console.log('🤖 ربات با موفقیت اجرا شد');