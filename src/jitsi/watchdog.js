const config = require('../config');
const log = require('../utils/logger');
const t = require('../config/i18n');

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
        const stepSec = Math.max(1, Math.round(config.afkCheckIntervalMs / 1000));
        this.timer = setInterval(async () => {
            const p = this.getPage();
            if (!p) return this.stop();

            try {
                const count = await p.evaluate(() => window.APP?.conference?.membersCount ?? 1);
                if (count <= 1) {
                    this.afkSeconds += stepSec;
                    if (this.afkSeconds % 60 === 0) {
                        log.info('AFK', `Empty room: ${this.afkSeconds / 60}/${config.afkTimeoutMs / 60000} min`);
                    }
                    if (this.afkSeconds >= (config.afkTimeoutMs / 1000)) {
                        this.stop();
                        log.info('AFK', `AFK limit reached (${config.afkTimeoutMs / 60000} min), exiting`);
                        await this.sendChat?.(t('j_afk', { min: config.afkTimeoutMs / 60000 })).catch(() => {});
                        await this.onTimeout();
                    }
                } else if (this.afkSeconds > 0) {
                    log.info('AFK', 'Participants detected, AFK timer reset');
                    this.afkSeconds = 0;
                }
            } catch {
                this.stop();
            }
        }, config.afkCheckIntervalMs);
    }

    stop() {
        clearInterval(this.timer);
        this.timer = null;
        this.afkSeconds = 0;
    }
}

module.exports = AfkWatchdog;
