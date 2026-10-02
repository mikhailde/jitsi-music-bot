const { launchJitsiBrowser } = require('./browser');
const JitsiPlayerBridge = require('./bridge');
const IdleWatchdog = require('./watchdog');
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
        this.actionQueue = Promise.resolve();
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

    queueAction(action) {
        this.actionQueue = this.actionQueue.then(async () => {
            if (this.isDestroyed) return;
            await action();
        }).catch(err => log.error('SESSION', 'Queued action error:', err));
        return this.actionQueue;
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
        log.debug('JITSI', `Connecting to room "${this.roomName}" (${this.domain})...`);

        this.watchdog = new IdleWatchdog({
            sendChat: m => this.bridge.sendChatMessage(m),
            onTimeout: () => this.destroy(t('reason_idle'))
        });

        const session = await launchJitsiBrowser({
            roomName: this.roomName,
            domain: this.domain,
            onTrackEnded: () => this.queueAction(() => this.handleTrackEnd(false)),
            onTrackError: (err) => this.queueAction(async () => {
                log.error('PLAYER', 'Playback error:', err);
                if (this.state.currentTrack) {
                    await this.bridge.sendChatMessage(t('j_err_track', { title: this.state.currentTrack.title }));
                }
                await this.handleTrackEnd(true);
            }),
            onKicked: () => this.destroy(t('reason_kicked')),
            onConferenceFailed: err => this.destroy(t('reason_conn_failed', { err })),
            onConnectionInterrupted: () => {
                log.warn('JITSI', `Connection interrupted, waiting up to ${config.reconnectTimeoutSec}s...`);
                this.clearConnectionTimer();
                this.connectionTimer = setTimeout(() => {
                    this.destroy(t('reason_conn_timeout', { sec: config.reconnectTimeoutSec }));
                }, config.reconnectTimeoutSec * 1000);
            },
            onConnectionRestored: () => {
                if (this.connectionTimer) {
                    this.clearConnectionTimer();
                    log.info('JITSI', 'Connection restored');
                }
            },
            onCrash: reason => this.destroy(t('reason_crash', { err: reason })),
            onLocalAudioMuted: async () => {
                if (this.isDestroyed || !this.state.isPlaying) return;
                const wasMuted = await this.bridge.eval(() => {
                    const a = window.botAudioElement;
                    if (!a || a.paused) return false;
                    a.pause();
                    return true;
                });

                if (wasMuted) {
                    log.info('PLAYER', 'Muted by participant, pausing playback');
                    await this.bridge.sendChatMessage(t('j_pause'));
                }
            },
            onRoomEmpty: async () => {
                if (this.isDestroyed) return;
                const wasPlaying = await this.bridge.eval(() => {
                    const a = window.botAudioElement;
                    if (!a || a.paused) return false;
                    a.pause();
                    return true;
                });

                if (wasPlaying) {
                    log.info('PLAYER', 'Room is empty, pausing playback');
                    await this.bridge.sendChatMessage(t('j_pause'));
                }
                this.watchdog?.onRoomEmpty();
            },
            onRoomActive: () => {
                if (this.isDestroyed) return;
                this.watchdog?.onRoomActive();
            },
            onCommandReceived: text => this.queueAction(async () => {
                await dispatch(text, {
                    state: this.state,
                    player: this.playerContext,
                    leaveBot: () => this.destroy(t('reason_chat_leave')),
                    fetchRadio: tr => this.fetchRadio(tr),
                    getTrackInfo
                });
            })
        });

        if (this.isDestroyed) {
            await session.browser?.close().catch(() => {});
            return;
        }

        this.browser = session.browser;
        this.page = session.page;
        log.info('JITSI', `Connected to room "${this.roomName}" (${this.domain})`);
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
                        this.fetchRadio(seed);
                        return;
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

    async destroy(reason = t('reason_normal')) {
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

                await new Promise(r => setTimeout(r, 600));
                await this.page.close().catch(() => {});
            }
            await this.browser.close().catch(() => {});
            this.browser = null;
            this.page = null;
            log.info('JITSI', `Disconnected from room "${this.roomName}" (${reason})`);
        }

        this.state.reset();
        this.onSessionEnd?.(this, reason);
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