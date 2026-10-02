const config = require('./config');
const { startAudioServer } = require('./audio');
const { leaveJitsiBot, createTelegramBot } = require('./platforms');
const log = require('./utils/logger');

process.on('unhandledRejection', reason => log.error('SYSTEM', 'Unhandled Rejection:', reason));
process.on('uncaughtException', err => log.error('SYSTEM', 'Uncaught Exception:', err));

(async () => {
    log.info('SYSTEM', 'Initializing service...');
    await startAudioServer();

    const bot = createTelegramBot();
    let isShuttingDown = false;

    const shutdown = async (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        log.warn('SYSTEM', `Service shutdown (${signal}): leaving conference...`);
        const timer = setTimeout(() => process.exit(0), config.shutdownTimeoutSec * 1000);

        await leaveJitsiBot(`Process termination (${signal})`).catch(() => {});
        await bot.stop().catch(() => {});
        clearTimeout(timer);
        process.exit(0);
    };

    ['SIGINT', 'SIGTERM'].forEach(s => process.on(s, shutdown));
    bot.start();
    log.info('SYSTEM', 'Telegram bot started');
})().catch(e => {
    log.error('SYSTEM', 'Fatal startup error:', e);
    process.exit(1);
});