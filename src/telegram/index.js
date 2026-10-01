const { Bot } = require('grammy');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../config');
const t = require('../config/i18n');
const log = require('../utils/logger');
const { startJitsiBot, leaveJitsiBot, getBotStatus } = require('../jitsi');

function createTelegramBot() {
    const client = config.proxy ? { baseFetchConfig: { agent: new SocksProxyAgent(config.proxy) } } : undefined;
    const bot = new Bot(config.telegramToken, { client });

    bot.use(async (ctx, next) => {
        const user = ctx.from;
        const userId = String(user?.id);
        const tag = `@${user?.username || 'no_user'} [${userId}]`;

        if (ctx.message?.text?.startsWith('/')) {
            log.info('TG', t('log_tg_cmd', { tag, cmd: ctx.message.text }));
        }

        if (config.adminIds.length && !config.adminIds.includes(userId)) {
            log.warn('TG', t('log_tg_auth_denied', { tag }));
            return ctx.reply(t('tg_auth_err', { userId }));
        }
        return next();
    });

    bot.command('start', ctx => ctx.reply(t('tg_start')));

    bot.command('join', async ctx => {
        const raw = ctx.match.trim();
        if (!raw) return ctx.reply(t('tg_empty_room'));

        const room = raw.replace(new RegExp(`.*${config.jitsiDomain}/`), '').split(/[?#]/)[0];
        ctx.reply(t('tg_joining', { room }));

        try {
            const ok = await startJitsiBot(room);
            return ctx.reply(ok ? t('tg_joined', { url: `https://${config.jitsiDomain}/${room}` }) : t('tg_busy'));
        } catch (e) {
            log.error('TG', t('log_tg_join_err', { room }), e.message);
            return ctx.reply(t('tg_error', { error: e.message }));
        }
    });

    bot.command('status', ctx => {
        const s = getBotStatus();
        if (!s.isConnected) return ctx.reply(t('tg_status_free'));

        const loopWord = t(s.loopMode === 'track' ? 'word_loop_1' : s.loopMode === 'queue' ? 'word_loop_q' : 'word_loop_off');

        return ctx.reply(t('tg_status_busy', {
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
        return ctx.reply(t('tg_left'));
    });

    return bot;
}

module.exports = { createTelegramBot };
