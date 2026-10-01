const JitsiSession = require('./session');

let activeSession = null;
let isConnecting = false;

async function startJitsiBot(roomName) {
    if (activeSession || isConnecting) return false;
    isConnecting = true;

    try {
        const session = new JitsiSession(roomName, () => {
            if (activeSession === session) activeSession = null;
        });
        await session.init();
        activeSession = session;
        return true;
    } catch (err) {
        activeSession = null;
        throw err;
    } finally {
        isConnecting = false;
    }
}

async function leaveJitsiBot() {
    if (activeSession) {
        const session = activeSession;
        activeSession = null;
        await session.destroy();
    }
}

function getBotStatus() {
    return activeSession ? activeSession.getStatus() : { isConnected: false };
}

module.exports = {
    JitsiSession,
    startJitsiBot,
    leaveJitsiBot,
    getBotStatus
};
