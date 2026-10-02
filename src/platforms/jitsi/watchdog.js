const config = require('../../config');
const log = require('../../utils/logger');
const t = require('../../config/i18n');

class IdleWatchdog {
    constructor({ onTimeout, sendChat }) {
        this.onTimeout = onTimeout;
        this.sendChat = sendChat;
        this.timer = null;
    }

    onRoomEmpty() {
        this.cancel();
        const timeoutSec = config.idleTimeoutSec;
        log.info('IDLE', `Room is empty, starting disconnect timer (${timeoutSec}s)`);

        this.timer = setTimeout(async () => {
            this.timer = null;
            log.info('IDLE', `IDLE timeout reached (${timeoutSec}s), exiting`);
            await this.sendChat?.(t('j_idle', { sec: timeoutSec })).catch(() => {});
            await this.onTimeout();
        }, timeoutSec * 1000);
    }

    onRoomActive() {
        if (this.timer) {
            log.info('IDLE', 'Participant joined, IDLE timer cancelled');
            this.cancel();
        }
    }

    cancel() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    stop() {
        this.cancel();
    }
}

module.exports = IdleWatchdog;