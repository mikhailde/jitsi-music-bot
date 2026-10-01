const config = require('./config');
const { startAudioServer } = require('./audio');
const { leaveJitsiBot } = require('./jitsi');
const { createTelegramBot } = require('./telegram');
const log = require('./utils/logger');

process.on('unhandledRejection', (reason) => {
    log.error('SYSTEM', 'Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    log.error('SYSTEM', 'Uncaught Exception:', err);
});

(async () => {
    log.info('SYSTEM', 'Initializing service...');
    await startAudioServer();

    const bot = createTelegramBot();
    const shutdown = async () => {
        log.warn('SYSTEM', 'Service shutdown: leaving conference...');
        const timer = setTimeout(() => process.exit(0), config.shutdownTimeoutMs);
        await leaveJitsiBot().catch(() => {});
        clearTimeout(timer);
        bot.stop();
        process.exit(0);
    };

    ['SIGINT', 'SIGTERM'].forEach(s => process.on(s, shutdown));
    bot.start();
    log.info('SYSTEM', 'Telegram bot started');
})().catch(e => log.error('SYSTEM', 'Fatal startup error:', e));
