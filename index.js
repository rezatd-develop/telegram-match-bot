require('dotenv').config();
const db = require('./db');

const { Telegraf, Markup } = require('telegraf');

// حذف پروکسی و اتصال مستقیم
const bot = new Telegraf(process.env.BOT_TOKEN);

// دیتابیس کوچک استان‌ها و شهرها
const PLACES = {
    'آذربایجان شرقی': ['تبریز', 'مراغه', 'مرند', 'میانه', 'اهر', 'بناب'],
    'آذربایجان غربی': ['ارومیه', 'خوی', 'مهاباد', 'بوکان', 'میاندوآب', 'سلماس'],
    'اردبیل': ['اردبیل', 'پارس‌آباد', 'مشگین‌شهر', 'خلخال', 'گرمی'],
    'اصفهان': ['اصفهان', 'کاشان', 'خمینی‌شهر', 'نجف‌آباد', 'شاهین‌شهر', 'فولادشهر'],
    'البرز': ['کرج', 'فردیس', 'نظرآباد', 'هشتگرد', 'محمدشهر'],
    'ایلام': ['ایلام', 'دهلران', 'ایوان', 'آبدانان', 'مهران'],
    'بوشهر': ['بوشهر', 'برازجان', 'گناوه', 'کنگان', 'دیر'],
    'تهران': ['تهران', 'ری', 'اسلامشهر', 'شهریار', 'پاکدشت', 'ورامین', 'رباط‌کریم', 'پردیس'],
    'چهارمحال و بختیاری': ['شهرکرد', 'بروجن', 'فارسان', 'لردگان'],
    'خراسان جنوبی': ['بیرجند', 'قائن', 'فردوس', 'طبس'],
    'خراسان رضوی': ['مشهد', 'نیشابور', 'سبزوار', 'تربت حیدریه', 'قوچان', 'کاشمر'],
    'خراسان شمالی': ['بجنورد', 'شیروان', 'اسفراین', 'فاروج'],
    'خوزستان': ['اهواز', 'آبادان', 'خرمشهر', 'دزفول', 'اندیمشک', 'ماهشهر', 'بهبهان'],
    'زنجان': ['زنجان', 'ابهر', 'خرمدره', 'قیدار'],
    'سمنان': ['سمنان', 'شاهرود', 'دامغان', 'گرمسار'],
    'سیستان و بلوچستان': ['زاهدان', 'چابهار', 'ایرانشهر', 'زابل', 'خاش'],
    'فارس': ['شیراز', 'مرودشت', 'جهرم', 'فسا', 'کازرون', 'لار', 'داراب'],
    'قزوین': ['قزوین', 'الوند', 'تاکستان', 'آبیک'],
    'قم': ['قم'],
    'کردستان': ['سنندج', 'سقز', 'مریوان', 'بانه', 'قروه'],
    'کرمان': ['کرمان', 'رفسنجان', 'سیرجان', 'جیرفت', 'بم'],
    'کرمانشاه': ['کرمانشاه', 'اسلام‌آباد غرب', 'جوانرود', 'سنقر'],
    'کهگیلویه و بویراحمد': ['یاسوج', 'دوگنبدان', 'دهدشت'],
    'گلستان': ['گرگان', 'گنبد کاووس', 'علی‌آباد', 'آق‌قلا'],
    'گیلان': ['رشت', 'انزلی', 'لاهیجان', 'آستارا', 'رودسر'],
    'لرستان': ['خرم‌آباد', 'بروجرد', 'دورود', 'الیگودرز', 'کوهدشت'],
    'مازندران': ['ساری', 'بابل', 'آمل', 'قائم‌شهر', 'نوشهر', 'چالوس'],
    'مرکزی': ['اراک', 'ساوه', 'خمین', 'محلات'],
    'هرمزگان': ['بندرعباس', 'میناب', 'قشم', 'بندر لنگه', 'حاجی‌آباد'],
    'همدان': ['همدان', 'ملایر', 'نهاوند', 'تویسرکان'],
    'یزد': ['یزد', 'میبد', 'اردکان', 'بافق']
};

const REGIONS = ['📍 شرق', '📍 غرب', '📍 شمال', '📍 جنوب', '📍 مرکز'];

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
    '❌ لغو جستجو',
    '👥 افراد نزدیک (هم‌محله‌ای)', '🏙️ کل سطح شهر'
];

function isProfileComplete(user) {
    return !!(user && user.age && user.province && user.city && user.region && user.gender && user.photo_file_id);
}

/* =========================
    Menus (منوی هوشمند بر اساس وضعیت کاربر)
========================= */

async function mainMenu(userId) {
    const [rows] = await db.query(`SELECT status FROM users WHERE telegram_id=?`, [userId]);
    const status = rows[0]?.status || 'idle';

    // ۱. اگر کاربر در حال چت باشد
    if (status === 'chatting') {
        return Markup.keyboard([
            ['🏋️ کجا میخوای بری؟'],
            ['🔄 نفر بعدی', '🛑 توقف چت'],
        ]).resize();
    }

    // ۲. اگر کاربر در صف انتظار پارتنر باشد (فقط دکمه لغو جستجو)
    if (status === 'waiting') {
        return Markup.keyboard([
            ['❌ لغو جستجو']
        ]).resize();
    }

    // ۳. منوی عادی در وضعیت آزاد (idle)
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

function editProfileMenu() {
    return Markup.keyboard([
        ['✏️ نام', '✏️ سن', '✏️ محل سکونت'],
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
    Find Partner & Matching Logic
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
    if (me.status === 'waiting') {
        return ctx.reply('🔎 در حال حاضر در صف انتظار هستی...', await mainMenu(myId));
    }

    return ctx.reply(
        '📍 ترجیح میدی پارتنرت چقدر بهت نزدیک باشه؟',
        Markup.keyboard([
            ['👥 افراد نزدیک (هم‌محله‌ای)'],
            ['🏙️ کل سطح شهر'],
            ['❌ لغو ویرایش']
        ]).resize()
    );
});

// هندل کردن انتخاب محدوده جستجو و قفل کردن منو روی «لغو جستجو»
bot.hears(['👥 افراد نزدیک (هم‌محله‌ای)', '🏙️ کل سطح شهر'], async (ctx) => {
    const myId = ctx.from.id;
    const me = ctx.userState;
    if (!me) return;

    const scope = ctx.message.text;
    let query = `SELECT * FROM users WHERE category=? AND city=? AND telegram_id != ? AND status='waiting'`;
    let queryParams = [me.category, me.city, myId];

    if (scope === '👥 افراد نزدیک (هم‌محله‌ای)') {
        query += ` AND region=?`;
        queryParams.push(me.region);
    }

    query += ` LIMIT 1`;
    const [rows] = await db.query(query, queryParams);

    if (rows.length === 0) {
        // تغییر وضعیت به waiting - از این لحظه منو به لغو جستجو تبدیل می‌شود
        await db.query(`UPDATE users SET status='waiting' WHERE telegram_id=?`, [myId]);
        return ctx.reply('🔎 در حال جستجوی پارتنر... لطفاً منتظر بمانید.', await mainMenu(myId));
    }

    const partner = rows[0];
    await db.query(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`, [partner.telegram_id, myId]);
    await db.query(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`, [myId, partner.telegram_id]);

    await ctx.reply('🎉 پارتنر پیدا شد!\nمی‌تونی گفتگو رو شروع کنی.', await mainMenu(myId));
    try { await bot.telegram.sendMessage(partner.telegram_id, '🎉 پارتنر پیدا شد!\nمی‌تونی گفتگو رو شروع کنی.', await mainMenu(partner.telegram_id)); } catch (e) { }
});

// هندلر دکمه خروج از صف (لغو جستجو)
bot.hears('❌ لغو جستجو', async (ctx) => {
    const myId = ctx.from.id;
    await db.query(`UPDATE users SET status='idle' WHERE telegram_id=?`, [myId]);
    await ctx.reply('🛑 جستجو لغو شد و شما از صف خارج شدید.', await mainMenu(myId));
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
        try { await bot.telegram.sendMessage(partnerId, '❌ طرف مقابل گفتگو را ترک کرد.', await mainMenu(partnerId)); } catch (e) { }
    }
    await ctx.reply('❌ گفتگو پایان یافت.', await mainMenu(myId));
});

bot.hears('🔄 نفر بعدی', async (ctx) => {
    const myId = ctx.from.id;
    const me = ctx.userState;
    if (!me) return;

    if (me.partner_id) {
        await db.query(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`, [me.partner_id]);
        try { await bot.telegram.sendMessage(me.partner_id, '🔄 طرف مقابل به سراغ نفر بعدی رفت.', await mainMenu(me.partner_id)); } catch (e) { }
    }

    await db.query(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`, [myId]);
    const [partners] = await db.query(`SELECT * FROM users WHERE category=? AND city=? AND telegram_id != ? AND status='waiting' LIMIT 1`, [me.category, me.city, myId]);

    if (partners.length === 0) {
        await db.query(`UPDATE users SET status='waiting' WHERE telegram_id=?`, [myId]);
        return ctx.reply('🔎 در حال جستجوی نفر بعدی در سطح شهر...', await mainMenu(myId));
    }

    const partner = partners[0];
    await db.query(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`, [partner.telegram_id, myId]);
    await db.query(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`, [myId, partner.telegram_id]);
    await ctx.reply('🎉 پارتنر جدید پیدا شد!', await mainMenu(myId));
    try { await bot.telegram.sendMessage(partner.telegram_id, '🎉 پارتنر جدید پیدا شد!', await mainMenu(partner.telegram_id)); } catch (e) { }
});

/* =========================
    Profile Setup, View & Edit
========================= */

bot.hears('👤 پروفایل', async (ctx) => {
    const user = ctx.userState;
    if (!user) return ctx.reply('لطفاً ابتدا ربات را /start کنید.');

    if (isProfileComplete(user)) {
        return ctx.replyWithPhoto(user.photo_file_id, {
            caption: `👤 نام: ${user.first_name}\n🎂 سن: ${user.age}\n🏙️ موقعیت: استان ${user.province}، شهر ${user.city} (${user.region})\n⚧️ جنسیت: ${user.gender}`,
            ...Markup.keyboard([['⚙️ ویرایش پروفایل'], ['🔙 برگشت']]).resize()
        });
    }

    await db.query(`UPDATE users SET profile_step='name' WHERE telegram_id=?`, [ctx.from.id]);
    await ctx.reply('👤 ساخت پروفایل جدید\n\nلطفاً نام خود را وارد کن:', Markup.keyboard([['❌ لغو ساخت پروفایل']]).resize());
});

bot.hears('⚙️ ویرایش پروفایل', async (ctx) => {
    await ctx.reply('🛠️ کدام بخش از پروفایل خود را می‌خواهید تغییر دهید؟', editProfileMenu());
});

bot.hears('❌ لغو ساخت پروفایل', async (ctx) => {
    await db.query(`UPDATE users SET profile_step=NULL WHERE telegram_id=?`, [ctx.from.id]);
    await ctx.reply('❌ فرآیند ساخت پروفایل لغو شد.', await mainMenu(ctx.from.id));
});

bot.hears('❌ لغو ویرایش', async (ctx) => {
    await db.query(`UPDATE users SET profile_step=NULL WHERE telegram_id=?`, [ctx.from.id]);
    await ctx.reply('🏠 منوی اصلی', await mainMenu(ctx.from.id));
});

bot.hears(['✏️ نام', '✏️ سن', '✏️ محل سکونت', '✏️ جنسیت', '✏️ عکس'], async (ctx) => {
    const field = ctx.message.text;
    let step = '', msg = '', keyboard = Markup.keyboard([['❌ لغو ویرایش']]).resize();

    if (field === '✏️ نام') { step = 'edit_name'; msg = '👤 نام جدید را وارد کنید:'; }
    else if (field === '✏️ سن') { step = 'edit_age'; msg = '🎂 سن جدید را وارد کنید:'; }
    else if (field === '✏️ محل سکونت') {
        step = 'edit_province';
        msg = '🗺️ استان جدید خود را انتخاب کنید:';
        keyboard = Markup.keyboard([...Object.keys(PLACES).map(p => [p]), ['❌ لغو ویرایش']]).resize();
    }
    else if (field === '✏️ جنسیت') {
        step = 'edit_gender'; msg = '⚧️ جنسیت جدید را انتخاب کنید:';
        keyboard = Markup.keyboard([['👨 مرد'], ['👩 زن'], ['❌ لغو ویرایش']]).resize();
    }
    else if (field === '✏️ عکس') { step = 'edit_photo'; msg = '📸 عکس جدید را ارسال کنید:'; }

    await db.query(`UPDATE users SET profile_step=? WHERE telegram_id=?`, [step, ctx.from.id]);
    await ctx.reply(msg, keyboard);
});

/* =========================
    Message Step & Wizard Handlers
========================= */

bot.on('message', async (ctx, next) => {
    const user = ctx.userState;
    if (!user || !user.profile_step) return next();
    if (['❌ لغو ساخت پروفایل', '❌ لغو ویرایش', '❌ لغو جستجو'].includes(ctx.message.text)) return next();

    const currentStep = user.profile_step;
    const input = ctx.message.text;

    // --- ساخت اولیه پروفایل ---
    if (currentStep === 'name') {
        if (!input) return ctx.reply('لطفاً نام را متنی ارسال کن.');
        await db.query(`UPDATE users SET first_name=?, profile_step='age' WHERE telegram_id=?`, [input, ctx.from.id]);
        return ctx.reply('🎂 سنت چند ساله؟', Markup.keyboard([['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'age') {
        const age = parseInt(input);
        if (isNaN(age) || age < 10 || age > 100) return ctx.reply('سن معتبر وارد کن.');
        await db.query(`UPDATE users SET age=?, profile_step='province' WHERE telegram_id=?`, [age, ctx.from.id]);

        const provinceButtons = Object.keys(PLACES).map(p => [p]);
        return ctx.reply('🗺️ استان محل سکونتت رو انتخاب کن:', Markup.keyboard([...provinceButtons, ['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'province') {
        if (!PLACES[input]) return ctx.reply('لطفاً یکی از استان‌های لیست را انتخاب کنید.');
        await db.query(`UPDATE users SET province=?, profile_step='city' WHERE telegram_id=?`, [input, ctx.from.id]);

        const cityButtons = PLACES[input].map(c => [c]);
        return ctx.reply('🏙️ حالا شهرت رو انتخاب کن:', Markup.keyboard([...cityButtons, ['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'city') {
        const province = user.province;
        if (!province || !PLACES[province].includes(input)) return ctx.reply('لطفاً یکی از شهرهای لیست را انتخاب کنید.');
        await db.query(`UPDATE users SET city=?, profile_step='region' WHERE telegram_id=?`, [input, ctx.from.id]);

        return ctx.reply('🧭 کدوم سمت شهری؟', Markup.keyboard([['📍 شمال', '📍 جنوب'], ['📍 شرق', '📍 غرب'], ['📍 مرکز'], ['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'region') {
        if (!REGIONS.includes(input)) return ctx.reply('لطفاً یکی از جهات جغرافیایی لیست را انتخاب کنید.');
        await db.query(`UPDATE users SET region=?, profile_step='gender' WHERE telegram_id=?`, [input, ctx.from.id]);
        return ctx.reply('⚧️ جنسیتت رو انتخاب کن:', Markup.keyboard([['👨 مرد'], ['👩 زن'], ['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'gender') {
        if (input !== '👨 مرد' && input !== '👩 زن') return ctx.reply('یکی از گزینه‌ها را انتخاب کن.');
        await db.query(`UPDATE users SET gender=?, profile_step='photo' WHERE telegram_id=?`, [input, ctx.from.id]);
        return ctx.reply('📸 حالا یک عکس از خودت ارسال کن.', Markup.keyboard([['❌ لغو ساخت پروفایل']]).resize());
    }
    if (currentStep === 'photo') {
        if (!ctx.message.photo) return ctx.reply('لطفاً یک عکس ارسال کن.');
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        await db.query(`UPDATE users SET photo_file_id=?, profile_step=NULL WHERE telegram_id=?`, [photo.file_id, ctx.from.id]);
        return ctx.reply('✅ پروفایل با موفقیت ذخیره شد. حالا می‌تونی پارتنر پیدا کنی!', await mainMenu(ctx.from.id));
    }

    // --- ویرایش تک‌مرحله‌ای ---
    if (currentStep === 'edit_name') {
        if (!input) return ctx.reply('نام معتبر وارد کنید.');
        await db.query(`UPDATE users SET first_name=?, profile_step=NULL WHERE telegram_id=?`, [input, ctx.from.id]);
        return ctx.reply('✅ نام شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
    if (currentStep === 'edit_age') {
        const age = parseInt(input);
        if (isNaN(age) || age < 10 || age > 100) return ctx.reply('سن معتبر وارد کنید.');
        await db.query(`UPDATE users SET age=?, profile_step=NULL WHERE telegram_id=?`, [age, ctx.from.id]);
        return ctx.reply('✅ سن شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
    if (currentStep === 'edit_province') {
        if (!PLACES[input]) return ctx.reply('استان معتبر انتخاب کنید.');
        await db.query(`UPDATE users SET province=?, profile_step='edit_city' WHERE telegram_id=?`, [input, ctx.from.id]);
        const cityButtons = PLACES[input].map(c => [c]);
        return ctx.reply('🏙️ حالا شهر جدید را انتخاب کنید:', Markup.keyboard([...cityButtons, ['❌ لغو ویرایش']]).resize());
    }
    if (currentStep === 'edit_city') {
        const province = user.province;
        if (!PLACES[province].includes(input)) return ctx.reply('شهر معتبر انتخاب کنید.');
        await db.query(`UPDATE users SET city=?, profile_step='edit_region' WHERE telegram_id=?`, [input, ctx.from.id]);
        return ctx.reply('🧭 کدوم سمت شهری؟', Markup.keyboard([['📍 شمال', '📍 جنوب'], ['📍 شرق', '📍 غرب'], ['📍 مرکز'], ['❌ لغو ویرایش']]).resize());
    }
    if (currentStep === 'edit_region') {
        if (!REGIONS.includes(input)) return ctx.reply('موقعیت معتبر انتخاب کنید.');
        await db.query(`UPDATE users SET region=?, profile_step=NULL WHERE telegram_id=?`, [input, ctx.from.id]);
        return ctx.reply('✅ محل سکونت شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
    if (currentStep === 'edit_gender') {
        if (input !== '👨 مرد' && input !== '👩 زن') return ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کنید.');
        await db.query(`UPDATE users SET gender=?, profile_step=NULL WHERE telegram_id=?`, [input, ctx.from.id]);
        return ctx.reply('✅ جنسیت شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
    if (currentStep === 'edit_photo') {
        if (!ctx.message.photo) return ctx.reply('لطفاً یک عکس معتبر بفرستید.');
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        await db.query(`UPDATE users SET photo_file_id=?, profile_step=NULL WHERE telegram_id=?`, [photo.file_id, ctx.from.id]);
        return ctx.reply('✅ عکس شما با موفقیت بروزرسانی شد.', await mainMenu(ctx.from.id));
    }
});

// چت ناشناس
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

bot.launch().then(() => console.log('🤖 ربات بدون پروکسی و با منوی لغو جستجو اجرا شد'));