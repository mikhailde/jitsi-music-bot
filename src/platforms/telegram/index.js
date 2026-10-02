const { Bot } = require('grammy');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../../config');
const t = require('../../config/i18n');
const log = require('../../utils/logger');
const { startJitsiBot, leaveJitsiBot, getBotStatus } = require('../jitsi');

const NO_PREVIEW = { link_preview_options: { is_disabled: true } };
const LOOP_MAP = { track: 'word_loop_1', queue: 'word_loop_q' };

function parseTarget(input) {
    const raw = input.trim();
    if (!raw.includes('/')) return { room: raw.split(/[?#]/)[0], domain: config.jitsiDomain };

    try {
        const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        return {
            room: decodeURIComponent(u.pathname.replace(/^\/+/, '')).split('/')[0],
            domain: u.host || config.jitsiDomain
        };
    } catch {
        return { room: raw.split(/[?#]/)[0].replace(/^\/+/, ''), domain: config.jitsiDomain };
    }
}

function createTelegramBot() {
    const client = config.proxy ? { baseFetchConfig: { agent: new SocksProxyAgent(config.proxy) } } : undefined;
    const bot = new Bot(config.telegramToken, { client });

    bot.catch(err => log.error('TG', 'Telegram bot error:', err.error || err.message));

    bot.use(async (ctx, next) => {
        if (!ctx.from) return;
        const userId = String(ctx.from.id);
        const tag = `@${ctx.from.username || 'no_user'} [${userId}]`;

        if (ctx.message?.text?.startsWith('/')) {
            log.info('TG', `${tag} -> ${ctx.message.text}`);
        }

        if (config.adminIds.length && !config.adminIds.includes(userId)) {
            log.warn('TG', `Access denied: ${tag}`);
            return ctx.reply(t('tg_auth_err', { userId }));
        }
        return next();
    });

    bot.command('start', ctx => ctx.reply(t('tg_start')));

    bot.command('join', async ctx => {
        const raw = ctx.match.trim();
        if (!raw) return ctx.reply(t('tg_empty_room'));

        const { room, domain } = parseTarget(raw);
        if (!room) return ctx.reply(t('tg_empty_room'));

        await ctx.reply(t('tg_joining', { room }));

        try {
            const ok = await startJitsiBot(room, domain);
            const msg = ok ? t('tg_joined', { url: `https://${domain}/${room}` }) : t('tg_busy');
            return ctx.reply(msg, NO_PREVIEW);
        } catch (e) {
            log.error('TG', `Failed to join ${room} (${domain}):`, e.message);
            return ctx.reply(t('tg_error', { error: e.message }));
        }
    });

    bot.command('status', ctx => {
        const s = getBotStatus();
        if (!s.isConnected) return ctx.reply(t('tg_status_free'));

        return ctx.reply(t('tg_status_busy', {
            url: s.url || `https://${config.jitsiDomain}/${s.roomName}`,
            track: s.currentTrack || t('j_np_silence'),
            queue: s.queueLength,
            volume: s.volume,
            loop: t(LOOP_MAP[s.loopMode] || 'word_loop_off'),
            radio: t(s.isRadioMode ? 'word_on' : 'word_off')
        }), NO_PREVIEW);
    });

    bot.command('leave', async ctx => {
        const s = getBotStatus();
        if (!s.isConnected) return ctx.reply(t('tg_status_free'));

        const user = ctx.from.username ? `@${ctx.from.username}` : `ID:${ctx.from.id}`;
        await leaveJitsiBot(`Telegram /leave (${user})`);
        return ctx.reply(t('tg_left'));
    });

    return bot;
}

module.exports = { createTelegramBot };