const config = require('../../config');
const JitsiSession = require('./session');

let activeSession = null;
let isConnecting = false;

async function startJitsiBot(roomName, domain = config.jitsiDomain) {
    if (activeSession || isConnecting) return false;
    isConnecting = true;

    const session = new JitsiSession(roomName, domain, () => {
        if (activeSession === session) activeSession = null;
    });

    activeSession = session;

    try {
        await session.init();
        return true;
    } catch (err) {
        await session.destroy('Init failed').catch(() => {});
        activeSession = null;
        throw err;
    } finally {
        isConnecting = false;
    }
}

async function leaveJitsiBot(reason = 'Manual leave') {
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
    getBotStatus
};