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

const MAIN_BUTTONS = [
    '🏋️ کجا میخوای بری؟',
    '🎯 پارتنرمو پیدا کن',
    '🛑 توقف چت',
    '🔄 نفر بعدی',
    '🔙 برگشت',
    '🏋️ باشگاه',
    '☕ کافه',
    '🚬 یه سیگاری بکشیم',
    '🎮 گیم‌نت',
    '👤 پروفایل',
    '⚙️ ویرایش پروفایل',
    '❌ لغو ساخت پروفایل',
    '❌ لغو ویرایش',
    '✏️ نام', '✏️ سن', '✏️ شهر', '✏️ جنسیت', '✏️ عکس'
];

function isProfileComplete(user) {
    return !!(user && user.age && user.city && user.gender && user.photo_file_id);
}

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

// منوی انتخاب بخش برای ویرایش
function editProfileMenu() {
    return Markup.keyboard([
        ['✏️ نام', '✏️ سن', '✏️ شهر'],
        ['✏️ جنسیت', '✏️ عکس'],
        ['❌ لغو ویرایش']
    ]).resize();
}

/* =========================
    Middleware
========================= */

bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    try {
        const [rows] = await db.query(`SELECT * FROM users WHERE telegram_id=?`, [ctx.from.id]);
        ctx.userState = rows[0] || null;
    } catch (err) {
        console.error('Database Error in Middleware:', err);
    }
    return next();
});

/* =========================
    Start & Category
========================= */

bot.start(async (ctx) => {
    const user = ctx.from;
    await db.query(`
        INSERT IGNORE INTO users (telegram_id, username, first_name, status)
        VALUES (?, ?, ?, 'idle')
    `, [user.id, user.username || '', user.first_name || '']);
    await ctx.reply(`سلام ${user.first_name} 👋\nبه ربات خوش اومدی.`, await mainMenu(user.id));
});

bot.hears('🏋️ کجا میخوای بری؟', async (ctx) => {
    await ctx.reply('یکی از گزینه‌های زیر را انتخاب کن:', categoryMenu());
});

bot.hears(['🏋️ باشگاه', '☕ کافه', '🚬 یه سیگاری بکشیم', '🎮 گیم‌نت'], async (ctx) => {
    const category = ctx.message.text;
    await db.query(`UPDATE users SET category=? WHERE telegram_id=?`, [category, ctx.from.id]);
    await ctx.reply(`✅ دسته‌بندی انتخاب شد:\n${category}`, await mainMenu(ctx.from.id));
});

bot.hears('🔙 برگشت', async (ctx) => {
    await ctx.reply('🏠 منوی اصلی', await mainMenu(ctx.from.id));
});

/* =========================
    Find Partner
========================= */

bot.hears('🎯 پارتنرمو پیدا کن', async (ctx) => {
    const myId = ctx.from.id;
    const [freshRows] = await db.query(`SELECT * FROM users WHERE telegram_id=?`, [myId]);
    const me = freshRows[0];

    if (!me) return ctx.reply('لطفاً ابتدا ربات را /start کنید.');

    if (!isProfileComplete(me)) {
        await db.query(`UPDATE users SET status='idle', profile_step='name' WHERE telegram_id=?`, [myId]);
        return ctx.reply(
            '⚠️ برای پیدا کردن پارتنر، ابتدا باید پروفایلت را تکمیل کنی.\n\n👤 لطفاً نام خود را وارد کن:',
            Markup.keyboard([['❌ لغو ساخت پروفایل']]).resize()
        );
    }

    if (!me.category) {
        await db.query(`UPDATE users SET status='idle' WHERE telegram_id=?`, [myId]);
        return ctx.reply('⚠️ هنوز مقصدت رو انتخاب نکردی.\nلطفاً ابتدا مشخص کن دوست داری کجا بری:', categoryMenu());
    }

    if (me.status === 'chatting') return ctx.reply('💬 در حال حاضر داخل یک گفتگو هستی.');
    if (me.status === 'waiting') return ctx.reply('🔎 در حال حاضر در صف انتظار هستی، لطفاً کمی شکیبا باش...');

    const [rows] = await db.query(`
        SELECT * FROM users WHERE category=? AND telegram_id != ? AND status='waiting' LIMIT 1
    `, [me.category, myId]);

    if (rows.length === 0) {
        await db.query(`UPDATE users SET status='waiting' WHERE telegram_id=?`, [myId]);
        return ctx.reply('🔎 در حال جستجوی پارتنر...');
    }

    const partner = rows[0];
    await db.query(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`, [partner.telegram_id, myId]);
    await db.query(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`, [myId, partner.telegram_id]);

    await ctx.reply('🎉 پارتنر پیدا شد!\nمی‌تونی گفتگو رو شروع کنی.', await mainMenu(myId));
    try { await bot.telegram.sendMessage(partner.telegram_id, '🎉 پارتنر پیدا شد!', await mainMenu(partner.telegram_id)); } catch (e) {}
});

/* =========================
    Stop Chat & Next Partner
========================= */

bot.hears('🛑 توقف چت', async (ctx) => {
    const myId = ctx.from.id;
    const me = ctx.userState;
    if (!me || me.status !== 'chatting') return ctx.reply('⚠️ در حال حاضر داخل هیچ گفتگویی نیستی.');

    const partnerId = me.partner_id;
    await db.query(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`, [myId]);
    if (partnerId) {
        await db.query(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`, [partnerId]);
        try { await bot.telegram.sendMessage(partnerId, '❌ طرف مقابل گفتگو را ترک کرد.', await mainMenu(partnerId)); } catch (e) {}
    }
    await ctx.reply('❌ گفتگو پایان یافت.', await mainMenu(myId));
});

bot.hears('🔄 نفر بعدی', async (ctx) => {
    const myId = ctx.from.id;
    const me = ctx.userState;
    if (!me) return;

    if (!isProfileComplete(me) || !me.category) return ctx.reply('⚠️ اطلاعات شما ناقص است.', await mainMenu(myId));

    if (me.partner_id) {
        await db.query(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`, [me.partner_id]);
        try { await bot.telegram.sendMessage(me.partner_id, '🔄 طرف مقابل به سراغ نفر بعدی رفت.', await mainMenu(me.partner_id)); } catch (e) {}
    }

    await db.query(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`, [myId]);
    const [partners] = await db.query(`SELECT * FROM users WHERE category=? AND telegram_id != ? AND status='waiting' LIMIT 1`, [me.category, myId]);

    if (partners.length === 0) {
        await db.query(`UPDATE users SET status='waiting' WHERE telegram_id=?`, [myId]);
        return ctx.reply('🔎 در حال جستجوی نفر بعدی...');
    }

    const partner = partners[0];
    await db.query(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`, [partner.telegram_id, myId]);
    await db.query(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`, [myId, partner.telegram_id]);
    await ctx.reply('🎉 پارتنر جدید پیدا شد!', await mainMenu(myId));
    try { await bot.telegram.sendMessage(partner.telegram_id, '🎉 پارتنر جدید پیدا شد!', await mainMenu(partner.telegram_id)); } catch (e) {}
});

/* =========================
    Profile Setup, View & Edit
========================= */

bot.hears('👤 پروفایل', async (ctx) => {
    const user = ctx.userState;
    if (!user) return ctx.reply('لطفاً ابتدا ربات را /start کنید.');

    // اگر پروفایل کامل دارد، آن را نشان بده و دکمه ویرایش را بگذار
    if (isProfileComplete(user)) {
        return ctx.replyWithPhoto(user.photo_file_id, {
            caption: `👤 نام: ${user.first_name}\n🎂 سن: ${user.age}\n🏙️ شهر: ${user.city}\n⚧️ جنسیت: ${user.gender}`,
            ...Markup.keyboard([
                ['⚙️ ویرایش پروفایل'],
                ['🔙 برگشت']
            ]).resize()
        });
    }

    // اگر پروفایل نداشت، اجبار به ساخت اولیه
    await db.query(`UPDATE users SET profile_step='name' WHERE telegram_id=?`, [ctx.from.id]);
    await ctx.reply('👤 ساخت پروفایل جدید\n\nلطفاً نام خود را وارد کن:', Markup.keyboard([['❌ لغو ساخت پروفایل']]).resize());
});

// ورود به بخش انتخاب بخش برای ویرایش
bot.hears('⚙️ ویرایش پروفایل', async (ctx) => {
    await ctx.reply('🛠️ کدام بخش از پروفایل خود را می‌خواهید تغییر دهید؟', editProfileMenu());
});

// لغو فرآیندها
bot.hears('❌ لغو ساخت پروفایل', async (ctx) => {
    await db.query(`UPDATE users SET profile_step=NULL WHERE telegram_id=?`, [ctx.from.id]);
    await ctx.reply('❌ فرآیند ساخت پروفایل لغو شد.', await mainMenu(ctx.from.id));
});

bot.hears('❌ لغو ویرایش', async (ctx) => {
    await db.query(`UPDATE users SET profile_step=NULL WHERE telegram_id=?`, [ctx.from.id]);
    await ctx.reply('🏠 ویرایش لغو شد.', await mainMenu(ctx.from.id));
});

// هندل کردن دکمه‌های گزینش فیلد برای ویرایش (تک‌مرحله‌ای)
bot.hears(['✏️ نام', '✏️ سن', '✏️ شهر', '✏️ جنسیت', '✏️ عکس'], async (ctx) => {
    const field = ctx.message.text;
    let step = '';
    let msg = '';
    let keyboard = Markup.keyboard([['❌ لغو ویرایش']]).resize();

    if (field === '✏️ نام') { step = 'edit_name'; msg = '👤 نام جدید خود را وارد کنید:'; }
    else if (field === '✏️ سن') { step = 'edit_age'; msg = '🎂 سن جدید خود را وارد کنید:'; }
    else if (field === '✏️ شهر') { step = 'edit_city'; msg = '🏙️ شهر جدید خود را وارد کنید:'; }
    else if (field === '✏️ جنسیت') { 
        step = 'edit_gender'; 
        msg = '⚧️ جنسیت جدید خود را انتخاب کنید:'; 
        keyboard = Markup.keyboard([['👨 مرد'], ['👩 زن'], ['❌ لغو ویرایش']]).resize();
    }
    else if (field === '✏️ عکس') { step = 'edit_photo'; msg = '📸 عکس جدید خود را ارسال کنید:'; }

    await db.query(`UPDATE users SET profile_step=? WHERE telegram_id=?`, [step, ctx.from.id]);
    await ctx.reply(msg, keyboard);
});

/* =========================
    Message Step & Forward Handlers
========================= */

bot.on('message', async (ctx, next) => {
    const user = ctx.userState;
    if (!user || !user.profile_step) return next();
    if (['❌ لغو ساخت پروفایل', '❌ لغو ویرایش'].includes(ctx.message.text)) return next();

    const currentStep = user.profile_step;

    // --- بخش اول: ساخت اولیه پروفایل (پشت سر هم) ---
    if (currentStep === 'name') {
        if (!ctx.message.text) return ctx.reply('لطفاً نام را متنی ارسال کن.');
        await db.query(`UPDATE users SET first_name=?, profile_step='age' WHERE telegram_id=?`, [ctx.message.text, ctx.from.id]);
        return ctx.reply('🎂 سنت چند ساله؟', Markup.keyboard([['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'age') {
        const age = parseInt(ctx.message.text);
        if (isNaN(age) || age < 10 || age > 100) return ctx.reply('سن معتبر وارد کن.');
        await db.query(`UPDATE users SET age=?, profile_step='city' WHERE telegram_id=?`, [age, ctx.from.id]);
        return ctx.reply('🏙️ شهر محل سکونتت چیه؟', Markup.keyboard([['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'city') {
        if (!ctx.message.text) return ctx.reply('لطفاً نام شهر را متنی بفرست.');
        await db.query(`UPDATE users SET city=?, profile_step='gender' WHERE telegram_id=?`, [ctx.message.text, ctx.from.id]);
        return ctx.reply('⚧️ جنسیتت رو انتخاب کن:', Markup.keyboard([['👨 مرد'], ['👩 زن'], ['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'gender') {
        const gender = ctx.message.text;
        if (gender !== '👨 مرد' && gender !== '👩 زن') return ctx.reply('یکی از گزینه‌ها را انتخاب کن.');
        await db.query(`UPDATE users SET gender=?, profile_step='photo' WHERE telegram_id=?`, [gender, ctx.from.id]);
        return ctx.reply('📸 حالا یک عکس از خودت ارسال کن.', Markup.keyboard([['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'photo') {
        if (!ctx.message.photo) return ctx.reply('لطفاً یک عکس ارسال کن.');
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        await db.query(`UPDATE users SET photo_file_id=?, profile_step=NULL WHERE telegram_id=?`, [photo.file_id, ctx.from.id]);
        return ctx.reply('✅ پروفایل با موفقیت ذخیره شد. حالا می‌تونی پارتنر پیدا کنی!', await mainMenu(ctx.from.id));
    }

    // --- بخش دوم: ویرایش تک‌مرحله‌ای فیلدها ---
    if (currentStep === 'edit_name') {
        if (!ctx.message.text) return ctx.reply('نام معتبر وارد کنید.');
        await db.query(`UPDATE users SET first_name=?, profile_step=NULL WHERE telegram_id=?`, [ctx.message.text, ctx.from.id]);
        return ctx.reply('✅ نام شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
    if (currentStep === 'edit_age') {
        const age = parseInt(ctx.message.text);
        if (isNaN(age) || age < 10 || age > 100) return ctx.reply('سن معتبر وارد کنید.');
        await db.query(`UPDATE users SET age=?, profile_step=NULL WHERE telegram_id=?`, [age, ctx.from.id]);
        return ctx.reply('✅ سن شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
    if (currentStep === 'edit_city') {
        if (!ctx.message.text) return ctx.reply('نام شهر معتبر وارد کنید.');
        await db.query(`UPDATE users SET city=?, profile_step=NULL WHERE telegram_id=?`, [ctx.message.text, ctx.from.id]);
        return ctx.reply('✅ شهر شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
    if (currentStep === 'edit_gender') {
        const gender = ctx.message.text;
        if (gender !== '👨 مرد' && gender !== '👩 زن') return ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کنید.');
        await db.query(`UPDATE users SET gender=?, profile_step=NULL WHERE telegram_id=?`, [gender, ctx.from.id]);
        return ctx.reply('✅ جنسیت شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
    if (currentStep === 'edit_photo') {
        if (!ctx.message.photo) return ctx.reply('لطفاً یک عکس معتبر بفرستید.');
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        await db.query(`UPDATE users SET photo_file_id=?, profile_step=NULL WHERE telegram_id=?`, [photo.file_id, ctx.from.id]);
        return ctx.reply('✅ عکس شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
});

// فوروارد چت ناشناس
bot.on('message', async (ctx) => {
    const me = ctx.userState;
    if (!me || me.status !== 'chatting' || !me.partner_id) return;
    if (ctx.message.text && MAIN_BUTTONS.includes(ctx.message.text)) return;

    try {
        await bot.telegram.copyMessage(me.partner_id, ctx.chat.id, ctx.message.message_id);
    } catch (err) {
        await db.query(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`, [ctx.from.id]);
        await ctx.reply('⚠️ ارتباط با طرف مقابل قطع شده است.', await mainMenu(ctx.from.id));
    }
});

bot.launch().then(() => console.log('🤖 ربات با موفقیت اجرا شد'));