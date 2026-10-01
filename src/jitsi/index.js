const { launchJitsiBrowser } = require('./browser');
const JitsiPlayerBridge = require('./player');
const AfkWatchdog = require('./watchdog');
const { fetchNextRadioTrack } = require('./radio');
const { dispatch } = require('./commands');
const { playerState } = require('../state');
const { getTrackInfo } = require('../audio');
const t = require('../config/i18n');
const log = require('../utils/logger');
const { formatTime } = require('../utils/format');

let browser = null;
let page = null;
let currentRoomName = null;
let watchdog = null;
let isConnecting = false;

const bridge = new JitsiPlayerBridge(() => page);

async function handleTrackEnd(isSkip = false) {
    if (playerState.isHandlingEnd) return;
    playerState.isHandlingEnd = true;

    try {
        if (playerState.currentTrack) {
            log.debug('PLAYER', `Track ended: "${playerState.currentTrack.title}" (skip: ${isSkip})`);
            playerState.addToHistory(playerState.currentTrack);
            if (playerState.loopMode === 'track' && !isSkip) playerState.enqueue(playerState.currentTrack, true);
            else if (playerState.loopMode === 'queue') playerState.enqueue(playerState.currentTrack, false);
        }

        playerState.isPlaying = false;
        await playNextInQueue();
    } finally {
        playerState.isHandlingEnd = false;
    }
}

async function playNextInQueue() {
    if (playerState.queue.length === 0) {
        playerState.isPlaying = false;
        if (playerState.isRadioMode) {
            const seed = playerState.history[0] || playerState.currentTrack;
            if (seed) {
                log.info('RADIO', `Queue empty, autoplay from: "${seed.title}"`);
                await bridge.sendChatMessage(t('j_radio_wait'));
                return fetchNextRadioTrack({
                    state: playerState,
                    sendChatMessage: m => bridge.sendChatMessage(m),
                    playNextInQueue,
                    track: seed
                });
            }
        }
        log.info('PLAYER', 'Queue is empty');
        return bridge.sendChatMessage(t('j_queue_empty'));
    }

    const track = playerState.dequeue();
    playerState.isPlaying = true;
    log.info('PLAYER', `Playing: "${track.title}" [${formatTime(track.duration)}]`);

    await bridge.sendChatMessage(t('j_play_now', {
        title: track.title,
        duration: formatTime(track.duration),
        url: track.url
    }));

    if (playerState.shouldTriggerRadio()) {
        fetchNextRadioTrack({
            state: playerState,
            sendChatMessage: m => bridge.sendChatMessage(m),
            playNextInQueue,
            track
        });
    }

    await bridge.playTrack(track.url, playerState.currentVolume);
}

const playerContext = {
    sendChatMessage: m => bridge.sendChatMessage(m),
    playNextInQueue,
    stopTrack: () => bridge.stopTrack(),
    pauseTrack: () => bridge.pauseTrack(),
    resumeTrack: () => bridge.resumeTrack(),
    setVolume: v => bridge.setVolume(v),
    getCurrentTime: () => bridge.getCurrentTime(),
    handleTrackEnd
};

async function startJitsiBot(roomName) {
    if (browser || isConnecting) return false;
    isConnecting = true;
    currentRoomName = roomName;
    log.info('JITSI', `Connecting to room: "${roomName}"`);

    try {
        const session = await launchJitsiBrowser({
            roomName,
            onTrackEnded: () => handleTrackEnd(false),
            onTrackError: async (err) => {
                log.error('PLAYER', 'Playback error:', err);
                if (playerState.currentTrack) {
                    await bridge.sendChatMessage(t('j_err_track', { title: playerState.currentTrack.title }));
                }
                await handleTrackEnd(true);
            },
            onCommandReceived: text => dispatch(text, {
                state: playerState,
                player: playerContext,
                leaveBot: () => leaveJitsiBot(),
                fetchRadio: tr => fetchNextRadioTrack({
                    state: playerState,
                    sendChatMessage: m => bridge.sendChatMessage(m),
                    playNextInQueue,
                    track: tr
                }),
                getTrackInfo
            })
        });

        browser = session.browser;
        page = session.page;
        log.info('JITSI', `Connected to room: "${roomName}"`);

        watchdog = new AfkWatchdog({
            getPage: () => page,
            sendChat: m => bridge.sendChatMessage(m),
            onTimeout: () => leaveJitsiBot()
        });
        watchdog.start();

        return true;
    } catch (err) {
        currentRoomName = null;
        throw err;
    } finally {
        isConnecting = false;
    }
}

async function leaveJitsiBot() {
    watchdog?.stop();
    watchdog = null;

    if (browser) {
        log.info('JITSI', `Disconnecting from room: "${currentRoomName}"`);
        if (page) {
            await page.evaluate(async () => {
                try {
                    const conf = window.APP?.store?.getState()?.['features/base/conference']?.conference;
                    if (conf && typeof conf.leave === 'function') await conf.leave();
                    document.querySelector('[data-testid="toolbar.hangup"], [aria-label*="Leave"], [aria-label*="hangup"]')?.click();
                } catch {}
            }).catch(() => {});

            await page.waitForTimeout(600);
            await page.close().catch(() => {});
        }
        await browser.close().catch(() => {});
        browser = null;
        page = null;
        playerState.reset();
        currentRoomName = null;
        log.info('JITSI', 'Disconnected from call');
    }
}

function getBotStatus() {
    return playerState.getStatus(currentRoomName, Boolean(browser));
}

module.exports = { startJitsiBot, leaveJitsiBot, getBotStatus };
