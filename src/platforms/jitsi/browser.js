const { chromium } = require('playwright');
const config = require('../../config');
const log = require('../../utils/logger');

const noop = () => {};

async function launchJitsiBrowser({
    roomName,
    domain,
    onCommandReceived,
    onTrackEnded,
    onTrackError,
    onKicked,
    onConferenceFailed,
    onConnectionInterrupted,
    onConnectionRestored,
    onCrash,
    onLocalAudioMuted
}) {
    const browser = await chromium.launch({
        headless: config.headless,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-fake-ui-for-media-stream',
            '--disable-web-security',
            '--allow-running-insecure-content',
            `--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:${config.port}`,
            '--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    browser.on('disconnected', () => onCrash?.('Browser process disconnected/killed'));
    page.on('crash', () => onCrash?.('Browser page crashed (OOM or renderer crash)'));

    page.on('console', msg => { if (msg.type() === 'error') log.debug('BROWSER', msg.text()); });
    page.on('pageerror', err => log.error('BROWSER', err.message));

    await page.addInitScript(() => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = ctx.createMediaStreamDestination();
        const gain = ctx.createGain();

        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        ctx.createMediaElementSource(audio).connect(gain);
        gain.connect(dest);

        Object.assign(window, {
            botAudioContext: ctx,
            botDestination: dest,
            botGainNode: gain,
            botAudioElement: audio
        });

        if (navigator.mediaDevices?.getUserMedia) {
            const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async (c) => {
                if (!c?.audio) return orig(c);
                const stream = dest.stream;
                stream.getAudioTracks().forEach(track => {
                    track.applyConstraints?.({
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        channelCount: 2
                    }).catch(() => {});
                });
                return stream;
            };
        }
    });

    const handlers = {
        onTrackEnded, onTrackError, onCommandReceived, onKicked,
        onConferenceFailed, onConnectionInterrupted, onConnectionRestored, onLocalAudioMuted
    };
    await Promise.all(
        Object.entries(handlers).map(([name, fn]) => page.exposeFunction(name, fn || noop))
    );

    await page.goto(config.getMeetUrl(roomName, domain), {
        waitUntil: 'domcontentloaded',
        timeout: config.connectTimeoutSec * 1000
    });

    await page.evaluate(({ joinTime, avatarUrl, connectTimeoutMs }) => {
        let elapsed = 0;
        let lastConf = null;
        let joined = false;

        const attachConference = (conf) => {
            if (!conf || conf === lastConf) return;
            lastConf = conf;

            if (avatarUrl) {
                window.APP?.conference?.changeLocalAvatarUrl?.(avatarUrl);
            }

            try {
                conf.on('conference.kicked', () => window.onKicked());
                conf.on('conference.failed', err => window.onConferenceFailed(String(err || 'Unknown failure')));
                conf.on('conference.connectionInterrupted', () => window.onConnectionInterrupted());
                conf.on('conference.connectionRestored', () => window.onConnectionRestored());
            } catch {}
        };

        const check = setInterval(() => {
            elapsed += 1000;
            document.querySelector('[data-testid="prejoin.joinMeeting"]')?.click();

            const store = window.APP?.store;
            if (store) {
                const confState = store.getState()['features/base/conference'];
                const conf = confState?.conference;
                attachConference(conf);

                // Мгновенный выход, если Jitsi вернула критическую ошибку (Lobby, пароль, etc.)
                if (!joined && confState?.error) {
                    clearInterval(check);
                    return window.onConferenceFailed(String(confState.error?.name || confState.error));
                }

                // Успешный вход в конференцию
                if (!joined && conf?.isJoined?.()) {
                    joined = true;
                    clearInterval(check);

                    let lastCount = store.getState()['features/chat']?.messages?.length || 0;
                    let lastAudioMuted = false;

                    store.subscribe(() => {
                        const state = store.getState();
                        attachConference(state['features/base/conference']?.conference);

                        const isMuted = Boolean(state['features/base/media']?.audio?.muted);
                        if (isMuted && !lastAudioMuted) window.onLocalAudioMuted();
                        lastAudioMuted = isMuted;

                        const msgs = state['features/chat']?.messages;
                        if (msgs && msgs.length > lastCount) {
                            for (let i = lastCount; i < msgs.length; i++) {
                                const { timestamp = Date.now(), message } = msgs[i];
                                if (timestamp >= joinTime && message?.startsWith('/')) {
                                    window.onCommandReceived(message);
                                }
                            }
                            lastCount = msgs.length;
                        }
                    });
                }
            }

            if (!joined && elapsed >= connectTimeoutMs) {
                clearInterval(check);
                window.onConferenceFailed(`Conference join timeout (${connectTimeoutMs / 1000}s)`);
            }
        }, 1000);
    }, {
        joinTime: Date.now(),
        avatarUrl: config.avatarUrl,
        connectTimeoutMs: config.connectTimeoutSec * 1000
    });

    return { browser, page };
}

module.exports = { launchJitsiBrowser };