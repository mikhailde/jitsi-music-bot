const { launchJitsiBrowser } = require('./browser');
const JitsiPlayerBridge = require('./bridge');
const AfkWatchdog = require('./watchdog');
const { dispatch } = require('./commands');
const { PlayerState } = require('../../core/player/state');
const { fetchNextRadioTrack } = require('../../core/radio/radio');
const { getTrackInfo } = require('../../audio');
const config = require('../../config');
const t = require('../../config/i18n');
const log = require('../../utils/logger');
const { formatTime } = require('../../utils/format');

const ERROR_SKIP_DELAY_MS = 200;

class JitsiSession {
    constructor(roomName, domain = config.jitsiDomain, onSessionEnd) {
        if (typeof domain === 'function') {
            onSessionEnd = domain;
            domain = config.jitsiDomain;
        }

        this.roomName = roomName;
        this.domain = domain;
        this.onSessionEnd = onSessionEnd;
        this.browser = null;
        this.page = null;
        this.watchdog = null;
        this.state = new PlayerState();
        this.bridge = new JitsiPlayerBridge(() => this.page);
        this.isDestroyed = false;
        this.commandChain = Promise.resolve();
        this.connectionTimer = null;

        this.playerContext = {
            sendChatMessage: m => this.bridge.sendChatMessage(m),
            playNextInQueue: () => this.playNextInQueue(),
            stopTrack: () => this.bridge.stopTrack(),
            pauseTrack: () => this.bridge.pauseTrack(),
            resumeTrack: () => this.bridge.resumeTrack(),
            setVolume: v => { this.state.setVolume(v); return this.bridge.setVolume(v); },
            getCurrentTime: () => this.bridge.getCurrentTime(),
            handleTrackEnd: isSkip => this.handleTrackEnd(isSkip)
        };
    }

    fetchRadio(track) {
        return fetchNextRadioTrack({
            state: this.state,
            playNextInQueue: () => this.playNextInQueue(),
            sendChat: m => this.bridge.sendChatMessage(m),
            track
        });
    }

    clearConnectionTimer() {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
    }

    async init() {
        log.debug('JITSI', `Connecting to room: "${this.roomName}"...`);

        const session = await launchJitsiBrowser({
            roomName: this.roomName,
            domain: this.domain,
            onTrackEnded: () => this.handleTrackEnd(false),
            onTrackError: async (err) => {
                log.error('PLAYER', 'Playback error:', err);
                if (this.state.currentTrack) {
                    await this.bridge.sendChatMessage(t('j_err_track', { title: this.state.currentTrack.title }));
                }
                await this.handleTrackEnd(true);
            },
            onKicked: () => this.destroy('Kicked by moderator'),
            onConferenceFailed: err => this.destroy(`Conference failed: ${err}`),
            onConnectionInterrupted: () => {
                log.warn('JITSI', `Connection interrupted, waiting up to ${config.reconnectTimeoutSec}s...`);
                this.clearConnectionTimer();
                this.connectionTimer = setTimeout(() => {
                    this.destroy(`Connection timeout (${config.reconnectTimeoutSec}s)`);
                }, config.reconnectTimeoutSec * 1000);
            },
            onConnectionRestored: () => {
                if (this.connectionTimer) {
                    this.clearConnectionTimer();
                    log.info('JITSI', 'Connection restored successfully');
                }
            },
            onCrash: reason => this.destroy(`Crash: ${reason}`),
            onLocalAudioMuted: async () => {
                if (this.isDestroyed || !this.state.isPlaying) return;
                const isPaused = await this.bridge.eval(() => window.botAudioElement?.paused);
                if (!isPaused) {
                    log.info('PLAYER', 'Muted by participant, pausing playback');
                    await this.playerContext.pauseTrack();
                }
            },
            onCommandReceived: text => {
                this.commandChain = this.commandChain.then(async () => {
                    if (this.isDestroyed) return;
                    await dispatch(text, {
                        state: this.state,
                        player: this.playerContext,
                        leaveBot: () => this.destroy('Chat /leave'),
                        fetchRadio: tr => this.fetchRadio(tr),
                        getTrackInfo
                    });
                }).catch(err => log.error('CMD', 'Command execution error:', err));
            }
        });

        if (this.isDestroyed) {
            await session.browser?.close().catch(() => {});
            return;
        }

        this.browser = session.browser;
        this.page = session.page;
        log.info('JITSI', `Connected to room: "${this.roomName}"`);

        this.watchdog = new AfkWatchdog({
            getPage: () => this.page,
            sendChat: m => this.bridge.sendChatMessage(m),
            onTimeout: () => this.destroy('AFK timeout (empty room)')
        });
        this.watchdog.start();
    }

    async handleTrackEnd(isSkip = false) {
        if (this.state.isHandlingEnd || this.isDestroyed) return;
        this.state.isHandlingEnd = true;

        try {
            if (this.state.currentTrack) {
                log.debug('PLAYER', `Track ended: "${this.state.currentTrack.title}" (skip: ${isSkip})`);
                this.state.addToHistory(this.state.currentTrack);
                if (this.state.loopMode === 'track' && !isSkip) {
                    this.state.enqueue(this.state.currentTrack, true);
                } else if (this.state.loopMode === 'queue') {
                    this.state.enqueue(this.state.currentTrack, false);
                }
            }

            this.state.isPlaying = false;
            await this.playNextInQueue();
        } finally {
            this.state.isHandlingEnd = false;
        }
    }

    async playNextInQueue() {
        if (this.isDestroyed || this.state.isStartingTrack) return;
        this.state.isStartingTrack = true;

        let hasPlayError = false;

        try {
            if (!this.state.queue.length) {
                this.state.isPlaying = false;
                if (this.state.isRadioMode) {
                    const seed = this.state.radioSeedTrack || this.state.history[0] || this.state.currentTrack;
                    if (seed) {
                        log.info('RADIO', `Queue empty, autoplay from anchor: "${seed.title}"`);
                        await this.bridge.sendChatMessage(t('j_radio_wait'));
                        return this.fetchRadio(seed);
                    }
                }
                log.info('PLAYER', 'Playback finished, idle');
                return;
            }

            const track = this.state.dequeue();
            this.state.isPlaying = true;
            log.info('PLAYER', `Playing: "${track.title}" [${formatTime(track.duration)}]`);

            await this.bridge.sendChatMessage(t('j_play_now', {
                title: track.title,
                duration: formatTime(track.duration),
                url: track.url
            }));

            if (this.state.shouldTriggerRadio()) {
                this.fetchRadio(this.state.radioSeedTrack || track);
            }

            try {
                await this.bridge.playTrack(track.url, this.state.currentVolume);
            } catch (err) {
                log.error('PLAYER', 'Failed to play track:', err.message);
                hasPlayError = true;
            }
        } finally {
            this.state.isStartingTrack = false;
        }

        if (hasPlayError) {
            await new Promise(r => setTimeout(r, ERROR_SKIP_DELAY_MS));
            await this.handleTrackEnd(true);
        }
    }

    async destroy(reason = 'Normal disconnect') {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        this.clearConnectionTimer();

        this.watchdog?.stop();
        this.watchdog = null;

        if (this.browser) {
            log.debug('JITSI', `Disconnecting from room "${this.roomName}" (${reason})...`);
            if (this.page) {
                await this.page.evaluate(async () => {
                    try {
                        const conf = window.APP?.store?.getState()?.['features/base/conference']?.conference;
                        if (conf && typeof conf.leave === 'function') await conf.leave();
                        document.querySelector('[data-testid="toolbar.hangup"], [aria-label*="Leave"], [aria-label*="hangup"]')?.click();
                    } catch {}
                }).catch(() => {});

                await this.page.waitForTimeout(600).catch(() => {});
                await this.page.close().catch(() => {});
            }
            await this.browser.close().catch(() => {});
            this.browser = null;
            this.page = null;
            log.info('JITSI', `Disconnected from room "${this.roomName}" (${reason})`);
        }

        this.state.reset();
        this.onSessionEnd?.(this);
    }

    getStatus() {
        const status = this.state.getStatus(this.roomName, Boolean(this.browser && !this.isDestroyed));
        if (status.isConnected) {
            status.domain = this.domain;
            status.url = `https://${this.domain}/${this.roomName}`;
        }
        return status;
    }
}

module.exports = JitsiSession;