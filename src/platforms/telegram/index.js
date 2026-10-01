const { Bot } = require('grammy');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../../config');
const t = require('../../config/i18n');
const log = require('../../utils/logger');
const { startJitsiBot, leaveJitsiBot, getBotStatus } = require('../jitsi');

function extractRoomName(input) {
    try {
        const urlStr = input.startsWith('http://') || input.startsWith('https://') 
            ? input 
            : `https://${config.jitsiDomain}/${input}`;
        const parsed = new URL(urlStr);
        return decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).split('/')[0];
    } catch {
        return input.split(/[?#]/)[0].replace(/^\/+/, '');
    }
}

function createTelegramBot() {
    const client = config.proxy ? { baseFetchConfig: { agent: new SocksProxyAgent(config.proxy) } } : undefined;
    const bot = new Bot(config.telegramToken, { client });

    bot.catch((err) => {
        log.error('TG', 'Telegram bot error:', err.error || err.message);
    });

    bot.use(async (ctx, next) => {
        const user = ctx.from;
        const userId = String(user?.id);
        const tag = `@${user?.username || 'no_user'} [${userId}]`;

        if (ctx.message?.text?.startsWith('/')) {
            log.info('TG', `${tag} -> ${ctx.message.text}`);
        }

        if (config.adminIds.length && !config.adminIds.includes(userId)) {
            log.warn('TG', `Access denied: ${tag}`);
            return ctx.reply(t('tg_auth_err', { userId }));
        }
        return next();
    });

    bot.command('start', async ctx => {
        await ctx.reply(t('tg_start'));
    });

    bot.command('join', async ctx => {
        const raw = ctx.match.trim();
        if (!raw) return ctx.reply(t('tg_empty_room'));

        const room = extractRoomName(raw);
        await ctx.reply(t('tg_joining', { room }));

        try {
            const ok = await startJitsiBot(room);
            return await ctx.reply(ok ? t('tg_joined', { url: `https://${config.jitsiDomain}/${room}` }) : t('tg_busy'));
        } catch (e) {
            log.error('TG', `Failed to join ${room}:`, e.message);
            return await ctx.reply(t('tg_error', { error: e.message }));
        }
    });

    bot.command('status', async ctx => {
        const s = getBotStatus();
        if (!s.isConnected) return await ctx.reply(t('tg_status_free'));

        const loopWord = t(s.loopMode === 'track' ? 'word_loop_1' : s.loopMode === 'queue' ? 'word_loop_q' : 'word_loop_off');

        return await ctx.reply(t('tg_status_busy', {
            url: `https://${config.jitsiDomain}/${s.roomName}`,
            track: s.currentTrack || t('j_np_silence'),
            queue: s.queueLength,
            volume: s.volume,
            loop: loopWord,
            radio: t(s.isRadioMode ? 'word_on' : 'word_off')
        }));
    });

    bot.command('leave', async ctx => {
        await leaveJitsiBot();
        return await ctx.reply(t('tg_left'));
    });

    return bot;
}

module.exports = { createTelegramBot };
