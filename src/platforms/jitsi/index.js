const config = require('../../config');
const t = require('../../config/i18n');
const JitsiSession = require('./session');

let activeSession = null;
let isConnecting = false;
let disconnectHandler = null;

function setDisconnectHandler(fn) {
    disconnectHandler = fn;
}

async function startJitsiBot(roomName, domain = config.jitsiDomain) {
    if (activeSession || isConnecting) return false;
    isConnecting = true;

    const session = new JitsiSession(roomName, domain, (s, reason) => {
        if (activeSession === session) activeSession = null;
        disconnectHandler?.({ roomName: s.roomName, domain: s.domain, reason });
    });

    activeSession = session;

    try {
        await session.init();
        return true;
    } catch (err) {
        await session.destroy(t('reason_init_failed')).catch(() => {});
        activeSession = null;
        throw err;
    } finally {
        isConnecting = false;
    }
}

async function leaveJitsiBot(reason = t('reason_normal')) {
    if (!activeSession) return false;
    const session = activeSession;
    activeSession = null;
    await session.destroy(reason);
    return true;
}

function getBotStatus() {
    return activeSession?.getStatus() ?? { isConnected: false };
}

module.exports = {
    JitsiSession,
    startJitsiBot,
    leaveJitsiBot,
    getBotStatus,
    setDisconnectHandler
};