const config = require('../../config');
const t = require('../../config/i18n');
const JitsiSession = require('./session');

let activeSession = null;
let isConnecting = false;
let disconnectHandler = null;

function setDisconnectHandler(fn) {
    disconnectHandler = fn;
}

async function startJitsiBot(roomName, domain = config.jitsiDomain, search = '') {
    if (activeSession || isConnecting) return false;
    isConnecting = true;

    const session = new JitsiSession(roomName, domain, search, (s, reason) => {
        if (activeSession === session) activeSession = null;
        disconnectHandler?.({ roomName: s.roomName, domain: s.domain, reason });
    });

    activeSession = session;

    try {
        await session.init();
        return true;
    } catch (err) {
        await session.destroy(t('reason_init_failed')).catch(() => {});
        if (activeSession === session) activeSession = null;
        throw err;
    } finally {
        isConnecting = false;
    }
}

async function leaveJitsiBot(reason = t('reason_normal')) {
    const session = activeSession;
    if (!session) return false;
    await session.destroy(reason);
    if (activeSession === session) activeSession = null;
    return true;
}

function getBotStatus() {
    const status = activeSession?.getStatus() ?? { isConnected: false };
    return {
        ...status,
        isBusy: Boolean(activeSession || isConnecting)
    };
}

module.exports = {
    JitsiSession,
    startJitsiBot,
    leaveJitsiBot,
    getBotStatus,
    setDisconnectHandler
};
