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
    }

    start() {
        this.stop();
        const stepSec = config.afkCheckIntervalSec;
        const totalSec = config.afkTimeoutSec;

        this.timer = setInterval(async () => {
            const p = this.getPage();
            if (!p) return this.stop();

            try {
                const count = await p.evaluate(() => window.APP?.conference?.membersCount ?? 1);

                if (count <= 1) {
                    if (this.afkSeconds === 0) {
                        log.info('AFK', `Room is empty, countdown started (${totalSec} sec timeout)`);
                    }

                    this.afkSeconds += stepSec;
                    log.debug('AFK', `Empty room: ${this.afkSeconds}/${totalSec} sec`);

                    if (this.afkSeconds < totalSec && this.afkSeconds + stepSec >= totalSec) {
                        const remaining = totalSec - this.afkSeconds;
                        log.warn('AFK', `Last AFK check: ${remaining} sec remaining before disconnect`);
                    }

                    if (this.afkSeconds >= totalSec) {
                        this.stop();
                        log.info('AFK', `AFK limit reached (${totalSec} sec), exiting`);
                        await this.sendChat?.(t('j_afk', { sec: totalSec })).catch(() => {});
                        await this.onTimeout();
                    }
                } else if (this.afkSeconds > 0) {
                    log.info('AFK', 'Participants detected, AFK timer reset');
                    this.afkSeconds = 0;
                }
            } catch {
                this.stop();
            }
        }, config.afkCheckIntervalSec * 1000);
    }

    stop() {
        clearInterval(this.timer);
        this.timer = null;
        this.afkSeconds = 0;
    }
}

module.exports = AfkWatchdog;