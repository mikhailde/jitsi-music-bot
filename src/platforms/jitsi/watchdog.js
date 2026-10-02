const config = require('../../config');
const log = require('../../utils/logger');
const t = require('../../config/i18n');

class AfkWatchdog {
    constructor({ getPage, onTimeout, sendChat }) {
        this.getPage = getPage;
        this.onTimeout = onTimeout;
        this.sendChat = sendChat;
        this.afkSeconds = 0;
        this.timer = null;
        this.isChecking = false;
    }

    start() {
        this.stop();
        const step = config.afkCheckIntervalSec;
        const limit = config.afkTimeoutSec;

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
                    if (this.afkSeconds === 0) {
                        log.info('AFK', `Room is empty, countdown started (${limit}s timeout)`);
                    }

                    this.afkSeconds += step;
                    log.debug('AFK', `Empty room: ${this.afkSeconds}/${limit}s`);

                    if (this.afkSeconds >= limit) {
                        this.stop();
                        log.info('AFK', `AFK limit reached (${limit}s), exiting`);
                        await this.sendChat?.(t('j_afk', { sec: limit })).catch(() => {});
                        return await this.onTimeout();
                    }
                } else if (this.afkSeconds > 0) {
                    log.info('AFK', 'Participants detected, AFK timer reset');
                    this.afkSeconds = 0;
                }
            } catch (err) {
                log.debug('AFK', 'Check poll error:', err.message);
            } finally {
                this.isChecking = false;
            }
        }, config.afkCheckIntervalSec * 1000);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.afkSeconds = 0;
        this.isChecking = false;
    }
}

module.exports = AfkWatchdog;