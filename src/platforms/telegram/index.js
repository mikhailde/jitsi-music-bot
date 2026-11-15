const { Bot } = require('grammy');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../../config');
const t = require('../../config/i18n');
const log = require('../../utils/logger');
const { startJitsiBot, leaveJitsiBot, getBotStatus, setDisconnectHandler } = require('../jitsi');

const NO_PREVIEW = { link_preview_options: { is_disabled: true } };
const LOOP_MAP = { track: 'word_loop_1', queue: 'word_loop_q' };

let activeChatId = null;

function parseTarget(input) {
    const raw = input.trim();
    const [head] = raw.split(/[?#]/, 1);
    if (!raw || (head.includes('://') && !/^https?:\/\//i.test(raw))) return null;

    const urlStr = !head.includes('/')
        ? `https://${config.jitsiDomain}/${raw}`
        : (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

    try {
        const u = new URL(urlStr);
        const rawRoom = u.pathname.replace(/^\/+/, '').split('/')[0];
        let room = rawRoom;
        try { room = decodeURIComponent(rawRoom); } catch {}
        return room ? { room, domain: u.host, search: u.search } : null;
    } catch {
        return null;
    }
}

async function syncBotProfile(bot) {
    const tasks = [
        { get: 'getMyDescription', set: 'setMyDescription', key: 'description', val: t('tg_description') },
        { get: 'getMyShortDescription', set: 'setMyShortDescription', key: 'short_description', val: t('tg_short_description') }
    ];

    await Promise.all(tasks.map(async ({ get, set, key, val }) => {
        try {
            const current = await bot.api[get]();
            if (!current?.[key]?.trim()) {
                await bot.api[set](val);
                log.info('TG', `Bot ${key} updated`);
            }
        } catch (err) {
            log.warn('TG', `Failed to update bot ${key}:`, err.message);
        }
    }));
}

function createTelegramBot() {
    let client;
    if (config.proxy) {
        if (/^socks/i.test(config.proxy)) {
            client = {
                baseFetchConfig: {
                    agent: new SocksProxyAgent(config.proxy, { timeout: 60_000 }),
                    compress: true
                }
            };
        } else {
            log.warn('TG', 'Only socks*:// proxy is supported for Telegram; connecting directly');
        }
    }

    const bot = new Bot(config.telegramToken, { client });
    syncBotProfile(bot);

    bot.catch(err => log.error('TG', 'Bot error:', err.error || err.message));

    bot.use(async (ctx, next) => {
        if (!ctx.from || !ctx.message?.text?.startsWith('/')) return;

        const mention = ctx.message.text.split(/\s+/, 1)[0].split('@')[1];
        if (mention && mention.toLowerCase() !== ctx.me.username.toLowerCase()) return;

        const userId = String(ctx.from.id);
        const tag = `@${ctx.from.username || 'no_user'} [${userId}]`;
        const safeText = ctx.message.text.replace(/([?&]jwt=)[^&\s#]+/gi, '$1***');
        log.info('TG', `${tag} -> ${safeText}`);

        if (config.adminIds.length && !config.adminIds.includes(userId)) {
            log.warn('TG', `Access denied: ${tag}`);
            return ctx.reply(t('tg_auth_err', { userId }));
        }
        return next();
    });

    bot.command('start', ctx => ctx.reply(t('tg_start'), NO_PREVIEW));

    bot.command('join', async ctx => {
        const target = parseTarget(ctx.match);
        if (!target) return ctx.reply(t('tg_empty_room'));
        if (getBotStatus().isConnected) return ctx.reply(t('tg_busy'));

        const { room, domain, search } = target;
        await ctx.reply(t('tg_joining', { room }));

        try {
            const ok = await startJitsiBot(room, domain, search);
            if (ok && getBotStatus().isConnected) activeChatId = ctx.chat.id;

            const msg = ok ? t('tg_joined', { url: `https://${domain}/${encodeURIComponent(room)}` }) : t('tg_busy');
            return ctx.reply(msg, NO_PREVIEW);
        } catch (e) {
            log.error('TG', `Failed to join ${room} (${domain}):`, e.message);
            return ctx.reply(t('tg_error', { error: e.message }));
        }
    });

    bot.command('status', ctx => {
        const s = getBotStatus();
        if (!s.isConnected) return ctx.reply(t('tg_status_free'));

        const track = s.currentTrack
            ? (s.isPaused ? `${s.currentTrack} (${t('j_pause').replace(/\.$/, '')})` : s.currentTrack)
            : t('j_np_silence');

        return ctx.reply(t('tg_status_busy', {
            url: s.url,
            track,
            queue: s.queueLength,
            volume: s.volume,
            loop: t(LOOP_MAP[s.loopMode] || 'word_loop_off'),
            radio: t(s.isRadioMode ? 'word_on' : 'word_off')
        }), NO_PREVIEW);
    });

    bot.command('leave', async ctx => {
        if (!getBotStatus().isConnected) return ctx.reply(t('tg_status_free'));

        const user = ctx.from.username ? `@${ctx.from.username}` : `ID:${ctx.from.id}`;
        const reason = t('reason_tg_leave');
        const initiatorChatId = activeChatId;
        activeChatId = null;

        await leaveJitsiBot(`${reason} (${user})`);

        const msg = t('tg_left', { reason });
        if (initiatorChatId && initiatorChatId !== ctx.chat.id) {
            await bot.api.sendMessage(initiatorChatId, msg).catch(() => {});
        }

        return ctx.reply(msg);
    });

    setDisconnectHandler(async ({ reason }) => {
        if (!activeChatId) return;
        const chatId = activeChatId;
        activeChatId = null;
        await bot.api.sendMessage(chatId, t('tg_left', { reason })).catch(() => {});
    });

    return bot;
}

module.exports = { createTelegramBot };