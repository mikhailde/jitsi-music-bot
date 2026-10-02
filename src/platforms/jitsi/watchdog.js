const config = require('../../config');
const log = require('../../utils/logger');
const t = require('../../config/i18n');

class IdleWatchdog {
    constructor({ getPage, onTimeout, sendChat }) {
        this.getPage = getPage;
        this.onTimeout = onTimeout;
        this.sendChat = sendChat;
        this.idleSeconds = 0;
        this.timer = null;
        this.isChecking = false;
    }

    start() {
        this.stop();
        const step = config.idleCheckIntervalSec;
        const limit = config.idleTimeoutSec;

        this.timer = setInterval(async () => {
            if (this.isChecking) return;
            this.isChecking = true;

            try {
                const p = this.getPage();
                if (!p || p.isClosed()) return this.stop();

                const count = await p.evaluate(() => {
                    const n = window.APP?.conference?.membersCount;
                    return Number.isInteger(n) ? n : null;
                });

                if (count === null) return;

                if (count <= 1) {
                    if (this.idleSeconds === 0) {
                        log.info('IDLE', `Room is empty, countdown started (${limit}s timeout)`);
                    }

                    this.idleSeconds += step;
                    log.debug('IDLE', `Empty room: ${this.idleSeconds}/${limit}s`);

                    if (this.idleSeconds >= limit) {
                        this.stop();
                        log.info('IDLE', `IDLE limit reached (${limit}s), exiting`);
                        await this.sendChat?.(t('j_idle', { sec: limit })).catch(() => {});
                        return await this.onTimeout();
                    }
                } else if (this.idleSeconds > 0) {
                    log.info('IDLE', 'Participants detected, IDLE timer reset');
                    this.idleSeconds = 0;
                }
            } catch (err) {
                log.debug('IDLE', 'Check poll error:', err.message);
            } finally {
                this.isChecking = false;
            }
        }, config.idleCheckIntervalSec * 1000);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.idleSeconds = 0;
        this.isChecking = false;
    }
}

module.exports = IdleWatchdog;