const { setTimeout: delay } = require('timers/promises');
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
    constructor(roomName, domain = config.jitsiDomain, search = '', onSessionEnd = null) {
        this.roomName = roomName;
        this.domain = domain;
        this.search = search;
        this.onSessionEnd = onSessionEnd;
        this.browser = null;
        this.page = null;
        this.watchdog = null;
        this.state = new PlayerState();
        this.bridge = new JitsiPlayerBridge(() => this.page);
        this.isDestroyed = false;
        this.pausedByEmptyRoom = false;
        this.actionQueue = Promise.resolve();
        this.connectionTimer = null;
        this.destroyPromise = null;

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
            playNextInQueue: () => this.queueAction(() => this.playNextInQueue()),
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
            search: this.search,
            onTrackEnded: () => this.queueAction(() => this.handleTrackEnd(false)),
            onTrackError: (err) => this.queueAction(async () => {
                log.error('PLAYER', 'Playback error:', err);
                if (this.state.currentTrack) {
                    await this.bridge.sendChatMessage(t('j_err_track', { title: this.state.currentTrack.title }));
                }
                await this.handleTrackEnd(true, true);
            }),
            onKicked: () => this.destroy(t('reason_kicked')),
            onConferenceFailed: err => this.destroy(t('reason_conn_failed', { err })),
            onConnectionInterrupted: () => {
                if (this.isDestroyed || this.connectionTimer) return;
                log.warn('JITSI', `Connection interrupted, waiting up to ${config.reconnectTimeoutSec}s...`);
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
            onCrash: reason => !this.isDestroyed && this.destroy(t('reason_crash', { err: reason })),
            onLocalAudioMuted: () => this.queueAction(async () => {
                if (!this.state.isPlaying || this.state.isPaused) return;
                if (await this.bridge.pauseTrack()) {
                    this.state.isPaused = true;
                    this.pausedByEmptyRoom = false;
                    log.info('PLAYER', 'Muted by participant, pausing playback');
                }
            }),
            onRoomEmpty: () => this.queueAction(async () => {
                if (this.state.isPlaying && !this.state.isPaused) {
                    if (await this.bridge.pauseTrack()) {
                        this.state.isPaused = true;
                        this.pausedByEmptyRoom = true;
                        log.info('PLAYER', 'Room is empty, pausing playback');
                    }
                }
                this.watchdog?.onRoomEmpty();
            }),
            onRoomActive: () => this.queueAction(async () => {
                this.watchdog?.onRoomActive();
                if (this.pausedByEmptyRoom && this.state.isPlaying && this.state.isPaused) {
                    this.pausedByEmptyRoom = false;
                    if (await this.bridge.resumeTrack()) {
                        this.state.isPaused = false;
                        log.info('PLAYER', 'Participant joined, resuming playback');
                    }
                }
            }),
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
            throw new Error('Connection cancelled');
        }

        this.browser = session.browser;
        this.page = session.page;
        log.info('JITSI', `Connected to room "${this.roomName}" (${this.domain})`);
    }

    async handleTrackEnd(isSkip = false, isError = false) {
        if (this.state.isHandlingEnd || this.isDestroyed) return;
        this.state.isHandlingEnd = true;

        try {
            if (this.state.currentTrack) {
                log.debug('PLAYER', `Track ended: "${this.state.currentTrack.title}" (skip: ${isSkip}, error: ${isError})`);
                this.state.addToHistory(this.state.currentTrack);
                if (this.state.loopMode === 'track' && !isSkip) {
                    this.state.enqueue(this.state.currentTrack, true);
                } else if (this.state.loopMode === 'queue' && !isError) {
                    this.state.enqueue(this.state.currentTrack, false);
                }
            }

            this.state.isPlaying = false;
        } finally {
            this.state.isHandlingEnd = false;
        }

        await this.playNextInQueue();
    }

    async playNextInQueue() {
        if (this.isDestroyed || this.state.isStartingTrack) return;
        this.state.isStartingTrack = true;

        let hasPlayError = false;

        try {
            this.state.isPaused = false;
            this.pausedByEmptyRoom = false;

            if (!this.state.queue.length) {
                const seed = this.state.radioSeedTrack || this.state.history[0];
                this.state.isPlaying = false;
                this.state.currentTrack = null;

                if (this.state.isRadioMode && seed) {
                    log.info('RADIO', `Queue empty, autoplay from anchor: "${seed.title}"`);
                    this.fetchRadio(seed);
                    return;
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
            await delay(ERROR_SKIP_DELAY_MS);
            await this.handleTrackEnd(true, true);
        }
    }

    async destroy(reason = t('reason_normal')) {
        if (this.destroyPromise) return this.destroyPromise;
        this.isDestroyed = true;

        this.destroyPromise = (async () => {
            this.pausedByEmptyRoom = false;
            this.clearConnectionTimer();
            this.watchdog?.stop();
            this.watchdog = null;

            try {
                if (this.browser) {
                    log.debug('JITSI', `Disconnecting from room "${this.roomName}" (${reason})...`);
                    if (this.page && !this.page.isClosed() && this.browser.isConnected()) {
                        let timer;
                        const left = await Promise.race([
                            this.page.evaluate(async () => {
                                try {
                                    const conf = window.APP?.store?.getState()?.['features/base/conference']?.conference;
                                    if (!conf) return false;
                                    await Promise.race([conf.leave(), new Promise(r => setTimeout(r, 1000))]);
                                    return true;
                                } catch {
                                    return false;
                                }
                            }).catch(() => false),
                            new Promise(r => { timer = setTimeout(() => r(false), 1500); })
                        ]).finally(() => clearTimeout(timer));

                        if (left) await delay(400);
                    }

                    let closeTimer;
                    await Promise.race([
                        this.browser.close().catch(() => {}),
                        new Promise(r => { closeTimer = setTimeout(r, 5000); })
                    ]).finally(() => clearTimeout(closeTimer));

                    log.info('JITSI', `Disconnected from room "${this.roomName}" (${reason})`);
                }
            } finally {
                this.browser = null;
                this.page = null;
                this.state.reset();
                this.onSessionEnd?.(this, reason);
            }
        })();

        return this.destroyPromise;
    }

    getStatus() {
        const status = this.state.getStatus(this.roomName, Boolean(this.browser && !this.isDestroyed));
        if (status.isConnected) {
            status.domain = this.domain;
            status.url = `https://${this.domain}/${encodeURIComponent(this.roomName)}`;
        }
        return status;
    }
}

module.exports = JitsiSession;
