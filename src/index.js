const config = require('./config');
const { startAudioServer } = require('./audio');
const { leaveJitsiBot } = require('./jitsi');
const { createTelegramBot } = require('./telegram');
const log = require('./utils/logger');
const t = require('./config/i18n');

(async () => {
    log.info('SYSTEM', t('log_init'));
    await startAudioServer();

    const bot = createTelegramBot();
    const shutdown = async () => {
        log.warn('SYSTEM', t('log_shutdown'));
        const timer = setTimeout(() => process.exit(0), config.shutdownTimeoutMs);
        await leaveJitsiBot().catch(() => {});
        clearTimeout(timer);
        bot.stop();
        process.exit(0);
    };

    ['SIGINT', 'SIGTERM'].forEach(s => process.on(s, shutdown));
    bot.start();
    log.info('SYSTEM', t('log_tg_started'));
})().catch(e => log.error('SYSTEM', t('log_fatal'), e));
