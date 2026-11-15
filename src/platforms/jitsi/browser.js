const { chromium } = require('playwright');
const config = require('../../config');
const log = require('../../utils/logger');

const noop = () => {};
const stripTimestamp = (str = '') => str.replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s*/i, '');

async function launchJitsiBrowser({
    roomName,
    domain,
    search = '',
    onCommandReceived,
    onTrackEnded,
    onTrackError,
    onKicked,
    onConferenceFailed,
    onConnectionInterrupted,
    onConnectionRestored,
    onCrash,
    onLocalAudioMuted,
    onRoomEmpty,
    onRoomActive
}) {
    const browser = await chromium.launch({
        headless: config.headless,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        args: [
            '--no-sandbox',
            '--auto-accept-camera-and-microphone-capture',
            '--use-fake-device-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
            '--mute-audio',
            '--disable-site-isolation-trials',
            '--disable-gpu-shader-disk-cache',
            '--disk-cache-size=1',
            '--media-cache-size=1',
            '--log-level=3',
            ...(config.headless ? [] : ['--disable-gpu'])
        ]
    });

    let isJoined = false;
    let isClosing = false;
    let joinResolve, joinReject;
    const joinPromise = new Promise((resolve, reject) => {
        joinResolve = resolve;
        joinReject = reject;
    });
    joinPromise.catch(() => {});

    try {
        const meetUrl = config.getMeetUrl(roomName, domain, search);
        const context = await browser.newContext({ bypassCSP: true });
        await context.grantPermissions(['local-network-access'], {
            origin: new URL(meetUrl).origin
        }).catch(() => {});
        const page = await context.newPage();

        const handleCrash = (reason) => {
            if (isClosing) return;
            if (!isJoined) {
                isClosing = true;
                return joinReject(new Error(reason));
            }
            onCrash?.(reason);
        };

        browser.on('disconnected', () => handleCrash('Browser process disconnected/killed'));
        page.on('crash', () => handleCrash('Browser page crashed (OOM or renderer crash)'));

        page.on('console', msg => {
            if (msg.type() === 'error') log.debug('BROWSER', stripTimestamp(msg.text()));
        });
        page.on('pageerror', err => log.error('BROWSER', stripTimestamp(err.message)));

        await page.addInitScript(() => {
            const ctx = new window.AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
            const dest = ctx.createMediaStreamDestination();
            const gain = ctx.createGain();
            const audio = new Audio();
            audio.crossOrigin = 'anonymous';
            ctx.createMediaElementSource(audio).connect(gain);
            gain.connect(dest);

            Object.assign(window, {
                botAudioContext: ctx,
                botGainNode: gain,
                botAudioElement: audio
            });

            if (navigator.mediaDevices?.getUserMedia) {
                const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
                navigator.mediaDevices.getUserMedia = async (c) => (
                    c?.audio ? new MediaStream(dest.stream.getAudioTracks().map(t => t.clone())) : orig(c)
                );
            }
        });

        const handlers = {
            onTrackEnded,
            onTrackError,
            onCommandReceived,
            onKicked,
            onConferenceJoined: () => {
                isJoined = true;
                joinResolve();
            },
            onConferenceFailed: (err) => {
                if (!isJoined) joinReject(new Error(`Conference failed: ${err}`));
                else onConferenceFailed?.(err);
            },
            onConnectionInterrupted,
            onConnectionRestored,
            onLocalAudioMuted,
            onRoomEmpty,
            onRoomActive
        };

        await Promise.all(
            Object.entries(handlers).map(([name, fn]) => page.exposeFunction(name, fn || noop))
        );

        const connectTimeoutMs = config.connectTimeoutSec * 1000;
        const deadline = Date.now() + connectTimeoutMs;
        const response = await page.goto(meetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: connectTimeoutMs
        });

        if (response && !response.ok()) {
            throw new Error(`Server returned HTTP ${response.status()} (${response.statusText()})`);
        }

        const isJitsi = await page.evaluate(({ joinTime, avatarUrl, connectTimeoutMs }) => {
            if (!window.config?.hosts) return false;

            let elapsed = 0;
            let lastConf = null;
            let joined = false;
            let lastRoomEmpty = null;
            let check = null;

            const updateRoomActivity = (conf) => {
                const participants = conf?.getParticipants?.();
                const count = Array.isArray(participants)
                    ? participants.length
                    : (typeof conf?.membersCount === 'number' ? Math.max(0, conf.membersCount - 1) : null);

                if (count === null) return;
                const isEmpty = count === 0;
                if (isEmpty === lastRoomEmpty) return;
                lastRoomEmpty = isEmpty;

                if (isEmpty) window.onRoomEmpty();
                else window.onRoomActive();
            };

            const attachConference = (conf) => {
                if (!conf || conf === lastConf) return;
                lastConf = conf;

                try {
                    conf.on('conference.kicked', () => window.onKicked());
                    conf.on('conference.failed', err => {
                        if (!joined) clearInterval(check);
                        window.onConferenceFailed(String(err || 'Unknown failure'));
                    });
                    conf.on('conference.connectionInterrupted', () => window.onConnectionInterrupted());
                    conf.on('conference.connectionRestored', () => window.onConnectionRestored());
                    conf.on('conference.userJoined', () => updateRoomActivity(conf));
                    conf.on('conference.userLeft', () => updateRoomActivity(conf));
                } catch {}

                if (joined) updateRoomActivity(conf);
            };

            check = setInterval(() => {
                elapsed += 1000;
                document.querySelector('[data-testid="prejoin.joinMeeting"]')?.click();

                const store = window.APP?.store;
                if (store) {
                    const state = store.getState();
                    const confState = state['features/base/conference'];
                    const conf = confState?.conference;
                    attachConference(conf);

                    if (confState?.error) {
                        clearInterval(check);
                        return window.onConferenceFailed(String(confState.error?.name || confState.error));
                    }

                    if (conf?.isJoined?.()) {
                        joined = true;
                        clearInterval(check);
                        if (avatarUrl) window.APP?.conference?.changeLocalAvatarUrl?.(avatarUrl);
                        window.onConferenceJoined();
                        updateRoomActivity(conf);

                        let lastMsgs = state['features/chat']?.messages;
                        let lastCount = lastMsgs?.length || 0;
                        let lastAudioMuted = Boolean(state['features/base/media']?.audio?.muted);

                        store.subscribe(() => {
                            const s = store.getState();
                            attachConference(s['features/base/conference']?.conference);

                            const isMuted = Boolean(s['features/base/media']?.audio?.muted);
                            if (isMuted && !lastAudioMuted) window.onLocalAudioMuted();
                            lastAudioMuted = isMuted;

                            const msgs = s['features/chat']?.messages;
                            if (msgs && msgs !== lastMsgs) {
                                lastMsgs = msgs;
                                if (msgs.length > lastCount) {
                                    const myId = s['features/base/participants']?.local?.id;
                                    for (let i = lastCount; i < msgs.length; i++) {
                                        const msg = msgs[i];
                                        const isMe = msg.isLocal || (myId && msg.senderId === myId);
                                        if (!isMe && (msg.timestamp || Date.now()) >= joinTime && msg.message?.startsWith('/')) {
                                            window.onCommandReceived(msg.message);
                                        }
                                    }
                                }
                                lastCount = msgs.length;
                            }
                        });
                        return;
                    }
                }

                if (elapsed >= connectTimeoutMs) {
                    clearInterval(check);
                    const state = store?.getState();
                    const sec = Math.ceil(connectTimeoutMs / 1000);
                    window.onConferenceFailed(state?.['features/lobby']?.knocking
                        ? `Lobby is enabled: admission timeout (${sec}s)`
                        : `Conference join timeout (${sec}s)`);
                }
            }, 1000);

            return true;
        }, {
            joinTime: Date.now(),
            avatarUrl: config.avatarUrl,
            connectTimeoutMs: Math.max(1000, deadline - Date.now())
        });

        if (!isJitsi) {
            throw new Error('Not a valid Jitsi Meet instance');
        }

        await joinPromise;
        return { browser, page };
    } catch (err) {
        isClosing = true;
        await browser.close().catch(() => {});

        const cleanMsg = (err.message || String(err || 'Connection failed'))
            .split('\n')[0]
            .replace(/\s+at\s+https?:\/\/.+$/, '')
            .trim();

        throw new Error(cleanMsg);
    }
}

module.exports = { launchJitsiBrowser };