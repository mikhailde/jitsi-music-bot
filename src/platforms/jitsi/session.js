const { launchJitsiBrowser } = require('./browser');
const JitsiPlayerBridge = require('./bridge');
const AfkWatchdog = require('./watchdog');
const { dispatch } = require('./commands');
const { PlayerState } = require('../../core/player/state');
const { fetchNextRadioTrack } = require('../../core/radio/radio');
const { getTrackInfo } = require('../../audio');
const t = require('../../config/i18n');
const log = require('../../utils/logger');
const { formatTime } = require('../../utils/format');

class JitsiSession {
    constructor(roomName, onSessionEnd) {
        this.roomName = roomName;
        this.onSessionEnd = onSessionEnd;
        this.browser = null;
        this.page = null;
        this.watchdog = null;
        this.state = new PlayerState();
        this.bridge = new JitsiPlayerBridge(() => this.page);
        this.isDestroyed = false;
        this.commandChain = Promise.resolve();

        this.playerContext = {
            sendChatMessage: m => this.bridge.sendChatMessage(m),
            playNextInQueue: () => this.playNextInQueue(),
            stopTrack: () => this.bridge.stopTrack(),
            pauseTrack: () => this.bridge.pauseTrack(),
            resumeTrack: () => this.bridge.resumeTrack(),
            setVolume: v => this.bridge.setVolume(v),
            getCurrentTime: () => this.bridge.getCurrentTime(),
            handleTrackEnd: isSkip => this.handleTrackEnd(isSkip)
        };
    }

    async init() {
        log.info('JITSI', `Connecting to room: "${this.roomName}"`);
        const session = await launchJitsiBrowser({
            roomName: this.roomName,
            onTrackEnded: () => this.handleTrackEnd(false),
            onTrackError: async (err) => {
                log.error('PLAYER', 'Playback error:', err);
                if (this.state.currentTrack) {
                    await this.bridge.sendChatMessage(t('j_err_track', { title: this.state.currentTrack.title }));
                }
                await this.handleTrackEnd(true);
            },
            onCommandReceived: text => {
                this.commandChain = this.commandChain.then(async () => {
                    if (this.isDestroyed) return;
                    await dispatch(text, {
                        state: this.state,
                        player: this.playerContext,
                        leaveBot: () => this.destroy(),
                        fetchRadio: tr => fetchNextRadioTrack({
                            state: this.state,
                            playNextInQueue: () => this.playNextInQueue(),
                            track: tr
                        }),
                        getTrackInfo
                    });
                }).catch(err => log.error('CMD', 'Command execution error:', err));
            }
        });

        this.browser = session.browser;
        this.page = session.page;
        log.info('JITSI', `Connected to room: "${this.roomName}"`);

        this.watchdog = new AfkWatchdog({
            getPage: () => this.page,
            sendChat: m => this.bridge.sendChatMessage(m),
            onTimeout: () => this.destroy()
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

        try {
            if (this.state.queue.length === 0) {
                this.state.isPlaying = false;
                if (this.state.isRadioMode) {
                    const seed = this.state.history[0] || this.state.currentTrack;
                    if (seed) {
                        log.info('RADIO', `Queue empty, autoplay from: "${seed.title}"`);
                        await this.bridge.sendChatMessage(t('j_radio_wait'));
                        return fetchNextRadioTrack({
                            state: this.state,
                            playNextInQueue: () => this.playNextInQueue(),
                            track: seed
                        });
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
                fetchNextRadioTrack({
                    state: this.state,
                    playNextInQueue: () => this.playNextInQueue(),
                    track
                });
            }

            await this.bridge.playTrack(track.url, this.state.currentVolume);
        } finally {
            this.state.isStartingTrack = false;
        }
    }

    async destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        this.watchdog?.stop();
        this.watchdog = null;

        if (this.browser) {
            log.info('JITSI', `Disconnecting from room: "${this.roomName}"`);
            if (this.page) {
                await this.page.evaluate(async () => {
                    try {
                        const conf = window.APP?.store?.getState()?.['features/base/conference']?.conference;
                        if (conf && typeof conf.leave === 'function') await conf.leave();
                        document.querySelector('[data-testid="toolbar.hangup"], [aria-label*="Leave"], [aria-label*="hangup"]')?.click();
                    } catch {}
                }).catch(() => {});

                await this.page.waitForTimeout(600);
                await this.page.close().catch(() => {});
            }
            await this.browser.close().catch(() => {});
            this.browser = null;
            this.page = null;
            this.state.reset();
            log.info('JITSI', 'Disconnected from call');
        }

        this.onSessionEnd?.(this);
    }

    getStatus() {
        return this.state.getStatus(this.roomName, Boolean(this.browser) && !this.isDestroyed);
    }
}

module.exports = JitsiSession;