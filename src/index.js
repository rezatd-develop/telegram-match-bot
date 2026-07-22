import { Telegraf, Markup } from 'telegraf';

const PLACES = {
    'Baden-Württemberg': ['Stuttgart', 'Karlsruhe', 'Mannheim', 'Freiburg', 'Heidelberg', 'Ulm'],
    'Bayern': ['München', 'Nürnberg', 'Augsburg', 'Regensburg', 'Würzburg', 'Ingolstadt'],
    'Berlin': ['Berlin'],
    'Brandenburg': ['Potsdam', 'Cottbus', 'Brandenburg an der Havel', 'Frankfurt (Oder)'],
    'Bremen': ['Bremen', 'Bremerhaven'],
    'Hamburg': ['Hamburg'],
    'Hessen': ['Frankfurt am Main', 'Wiesbaden', 'Kassel', 'Darmstadt', 'Offenbach'],
    'Mecklenburg-Vorpommern': ['Rostock', 'Schwerin', 'Neubrandenburg', 'Greifswald'],
    'Niedersachsen': ['Hannover', 'Braunschweig', 'Oldenburg', 'Osnabrück', 'Göttingen'],
    'Nordrhein-Westfalen': ['Köln', 'Düsseldorf', 'Dortmund', 'Essen', 'Duisburg', 'Münster', 'Bonn'],
    'Rheinland-Pfalz': ['Mainz', 'Ludwigshafen', 'Koblenz', 'Trier', 'Kaiserslautern'],
    'Saarland': ['Saarbrücken', 'Neunkirchen', 'Homburg'],
    'Sachsen': ['Dresden', 'Leipzig', 'Chemnitz', 'Zwickau'],
    'Sachsen-Anhalt': ['Magdeburg', 'Halle (Saale)', 'Dessau-Roßlau'],
    'Schleswig-Holstein': ['Kiel', 'Lübeck', 'Flensburg', 'Neumünster'],
    'Thüringen': ['Erfurt', 'Jena', 'Gera', 'Weimar']
};

const REGIONS = ['📍 Nord', '📍 Süd', '📍 Ost', '📍 West', '📍 Zentrum'];

const MAIN_BUTTONS = [
    '🏋️ Wohin möchtest du?', '🎯 Partner finden', '🛑 Chat beenden',
    '🔄 Nächste Person', '🔙 Zurück', '🏋️ Fitnessstudio', '☕ Café',
    '🍺 Biergarten / Bar', '🫖 Shisha Bar', '🚶‍♂️ Spaziergang',
    '🤷‍♂️ Egal / Spontan', '👤 Profil', '⚙️ Profil bearbeiten',
    '❌ Profilerstellung abbrechen', '❌ Bearbeitung abbrechen', '❌ Suche abbrechen',
    '👥 In der Nähe (Gleicher Stadtteil)', '🏙️ Gute Erreichbarkeit (Ganze Stadt)',
    '👁️ Partnerprofil ansehen'
];

function isProfileComplete(user) {
    return !!(user && user.age && user.province && user.city && user.region && user.gender && user.photo_file_id);
}

function getProfileCaption(user) {
    return `👤 Name: ${user.first_name}\n🎂 Alter: ${user.age}\n🏙️ Standort: ${user.province}, ${user.city} (${user.region})\n⚧️ Geschlecht: ${user.gender}\n🎯 Bevorzugtes Ziel: ${user.category || 'Nicht angegeben'}`;
}

async function mainMenu(db, userId) {
    const user = await db.prepare(`SELECT status FROM users WHERE telegram_id=?`).bind(userId).first();
    const status = user?.status || 'idle';

    if (status === 'chatting') {
        return Markup.keyboard([
            ['👁️ Partnerprofil ansehen'],
            ['🔄 Nächste Person', '🛑 Chat beenden'],
        ]).resize();
    }

    if (status === 'waiting') {
        return Markup.keyboard([['❌ Suche abbrechen']]).resize();
    }

    return Markup.keyboard([
        ['🏋️ Wohin möchtest du?'],
        ['🎯 Partner finden'],
        ['👤 Profil']
    ]).resize();
}

function categoryMenu() {
    return Markup.keyboard([
        ['🏋️ Fitnessstudio', '☕ Café'],
        ['🍺 Biergarten / Bar', '🫖 Shisha Bar'],
        ['🚶‍♂️ Spaziergang'],
        ['🤷‍♂️ Egal / Spontan'],
        ['🔙 Zurück']
    ]).resize();
}

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('OK', { status: 200 });
        }

        const bot = new Telegraf(env.BOT_TOKEN);
        const db = env.warum_allein_db;

        // Middleware دریافت اطلاعات کاربر
        bot.use(async (ctxHandler, next) => {
            if (!ctxHandler.from) return;
            const user = await db.prepare(`SELECT * FROM users WHERE telegram_id=?`).bind(ctxHandler.from.id).first();
            ctxHandler.userState = user || null;
            return next();
        });

        bot.start(async (ctxHandler) => {
            const user = ctxHandler.from;
            await db.prepare(`
                INSERT INTO users (telegram_id, username, first_name, status)
                VALUES (?, ?, ?, 'idle')
                ON CONFLICT(telegram_id) DO NOTHING
            `).bind(user.id, user.username || '', user.first_name || '').run();

            await ctxHandler.reply(`Hallo ${user.first_name} 👋\nWillkommen bei Warum Allein Bot!`, await mainMenu(db, user.id));
        });

        bot.hears('🏋️ Wohin möchtest du?', async (ctxHandler) => {
            await ctxHandler.reply('Wähle eine der folgenden Optionen aus:', categoryMenu());
        });

        bot.hears(['🏋️ Fitnessstudio', '☕ Café', '🍺 Biergarten / Bar', '🫖 Shisha Bar', '🚶‍♂️ Spaziergang', '🤷‍♂️ Egal / Spontan'], async (ctxHandler) => {
            const category = ctxHandler.message.text;
            await db.prepare(`UPDATE users SET category=? WHERE telegram_id=?`).bind(category, ctxHandler.from.id).run();
            await ctxHandler.reply(`✅ Kategorie ausgewählt:\n${category}`, await mainMenu(db, ctxHandler.from.id));
        });

        bot.hears('🔙 Zurück', async (ctxHandler) => {
            await ctxHandler.reply('🏠 Hauptmenü', await mainMenu(db, ctxHandler.from.id));
        });

        // منطق جستجو و چت
        bot.hears('🎯 Partner finden', async (ctxHandler) => {
            const myId = ctxHandler.from.id;
            const me = await db.prepare(`SELECT * FROM users WHERE telegram_id=?`).bind(myId).first();

            if (!me) return ctxHandler.reply('Bitte starte den Bot zuerst mit /start.');

            if (!isProfileComplete(me)) {
                await db.prepare(`UPDATE users SET status='idle', profile_step='name' WHERE telegram_id=?`).bind(myId).run();
                return ctxHandler.reply(
                    '⚠️ Um einen Partner zu finden, musst du zuerst dein Profil vervollständigen.\n\n👤 Bitte gib deinen Namen ein:',
                    Markup.keyboard([['❌ Profilerstellung abbrechen']]).resize()
                );
            }

            if (!me.category) {
                await db.prepare(`UPDATE users SET status='idle' WHERE telegram_id=?`).bind(myId).run();
                return ctxHandler.reply('⚠️ Du hast noch kein Ziel ausgewählt.\nBitte gib zuerst an, wohin du gehen möchtest:', categoryMenu());
            }

            if (me.status === 'chatting') return ctxHandler.reply('💬 Du befindest dich derzeit in einem Gespräch.');
            if (me.status === 'waiting') {
                return ctxHandler.reply('🔎 Du bist bereits in der Warteschlange...', await mainMenu(db, myId));
            }

            return ctxHandler.reply(
                '📍 Wie nah sollte dein Partner sein?',
                Markup.keyboard([
                    ['👥 In der Nähe (Gleicher Stadtteil)'],
                    ['🏙️ Gute Erreichbarkeit (Ganze Stadt)'],
                    ['❌ Bearbeitung abbrechen']
                ]).resize()
            );
        });

        bot.hears(['👥 In der Nähe (Gleicher Stadtteil)', '🏙️ Gute Erreichbarkeit (Ganze Stadt)'], async (ctxHandler) => {
            const myId = ctxHandler.from.id;
            const me = ctxHandler.userState;
            if (!me) return;

            const scope = ctxHandler.message.text;
            await db.prepare(`UPDATE users SET search_scope=? WHERE telegram_id=?`).bind(scope, myId).run();

            let query = `SELECT * FROM users WHERE city=? AND telegram_id != ? AND status='waiting'`;
            let params = [me.city, myId];

            if (me.category !== '🤷‍♂️ Egal / Spontan') {
                query += ` AND (category = ? OR category = '🤷‍♂️ Egal / Spontan')`;
                params.push(me.category);
            }

            if (scope === '👥 In der Nähe (Gleicher Stadtteil)') {
                query += ` AND region=?`;
                params.push(me.region);
            }

            query += ` LIMIT 1`;
            const partner = await db.prepare(query).bind(...params).first();

            if (!partner) {
                await db.prepare(`UPDATE users SET status='waiting' WHERE telegram_id=?`).bind(myId).run();
                return ctxHandler.reply('🔎 Suche nach einem Partner... Bitte habe einen Moment Geduld.', await mainMenu(db, myId));
            }

            await db.prepare(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`).bind(partner.telegram_id, myId).run();
            await db.prepare(`UPDATE users SET status='chatting', partner_id=? WHERE telegram_id=?`).bind(myId, partner.telegram_id).run();

            await ctxHandler.reply('🎉 Partner gefunden!\nDu kannst jetzt das Gespräch beginnen.', await mainMenu(db, myId));
            try { await ctxHandler.replyWithPhoto(partner.photo_file_id, { caption: `👤 Profil deines Gesprächspartners:\n\n${getProfileCaption(partner)}` }); } catch (e) { }

            try {
                await bot.telegram.sendMessage(partner.telegram_id, '🎉 Partner gefunden!\nDu kannst jetzt das Gespräch beginnen.', await mainMenu(db, partner.telegram_id));
                await bot.telegram.sendPhoto(partner.telegram_id, me.photo_file_id, { caption: `👤 Profil deines Gesprächspartners:\n\n${getProfileCaption(me)}` });
            } catch (e) { }
        });

        bot.hears('❌ Suche abbrechen', async (ctxHandler) => {
            const myId = ctxHandler.from.id;
            await db.prepare(`UPDATE users SET status='idle' WHERE telegram_id=?`).bind(myId).run();
            await ctxHandler.reply('🛑 Die Suche wurde abgebrochen.', await mainMenu(db, myId));
        });

        bot.hears('🛑 Chat beenden', async (ctxHandler) => {
            const myId = ctxHandler.from.id;
            const me = ctxHandler.userState;
            if (!me || me.status !== 'chatting') return ctxHandler.reply('⚠️ Du bist derzeit in keinem Chat.');

            const partnerId = me.partner_id;
            await db.prepare(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`).bind(myId).run();
            if (partnerId) {
                await db.prepare(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`).bind(partnerId).run();
                try { await bot.telegram.sendMessage(partnerId, '❌ Dein Gesprächspartner hat den Chat verlassen.', await mainMenu(db, partnerId)); } catch (e) { }
            }
            await ctxHandler.reply('❌ Das Gespräch wurde beendet.', await mainMenu(db, myId));
        });

        // هندلر پیام‌های چت ناشناس
        bot.on('message', async (ctxHandler) => {
            const me = ctxHandler.userState;
            if (!me || me.status !== 'chatting' || !me.partner_id) return;
            if (ctxHandler.message.text && MAIN_BUTTONS.includes(ctxHandler.message.text)) return;

            try {
                await bot.telegram.copyMessage(me.partner_id, ctxHandler.chat.id, ctxHandler.message.message_id);
            } catch (err) {
                await db.prepare(`UPDATE users SET status='idle', partner_id=NULL WHERE telegram_id=?`).bind(ctxHandler.from.id).run();
                await ctxHandler.reply('⚠️ Die Verbindung zum Gesprächspartner wurde unterbrochen.', await mainMenu(db, ctxHandler.from.id));
            }
        });

        const update = await request.json();
        await bot.handleUpdate(update);
        return new Response('OK', { status: 200 });
    }
};