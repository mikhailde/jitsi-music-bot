const { chromium } = require('playwright');
const config = require('../config');
const log = require('../utils/logger');

async function launchJitsiBrowser({ roomName, onCommandReceived, onTrackEnded, onTrackError }) {
    const browser = await chromium.launch({
        headless: config.headless,
        // Запрещаем Playwright аварийно убивать браузер на сигналах Docker
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

    page.on('console', msg => { if (msg.type() === 'error') log.debug('BROWSER', msg.text()); });
    page.on('pageerror', err => log.error('BROWSER', err.message));

    await page.addInitScript(() => {
        window.botAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        window.botDestination = window.botAudioContext.createMediaStreamDestination();
        const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (c) => (c?.audio ? window.botDestination.stream : orig(c));
    });

    await Promise.all([
        page.exposeFunction('onTrackEnded', onTrackEnded),
        page.exposeFunction('onTrackError', onTrackError),
        page.exposeFunction('onCommandReceived', onCommandReceived)
    ]);

    await page.goto(config.getMeetUrl(roomName), { waitUntil: 'domcontentloaded' });

    try {
        const btn = page.locator('[data-testid="prejoin.joinMeeting"]');
        if (await btn.isVisible({ timeout: 2000 })) {
            await page.locator('input[type="text"]').first().fill(config.botName).catch(() => {});
            await btn.click().catch(() => {});
        }
    } catch {}

    const botJoinTime = Date.now();

    if (config.avatarUrl) {
        await page.evaluate((url) => {
            const timer = setInterval(() => {
                if (typeof window.APP?.conference?.changeLocalAvatarUrl === 'function') {
                    window.APP.conference.changeLocalAvatarUrl(url);
                }
            }, 2000);
            setTimeout(() => clearInterval(timer), 20000);
        }, config.avatarUrl);
    }

    await page.evaluate((joinTime) => {
        const check = setInterval(() => {
            const store = window.APP?.store;
            if (store) {
                let lastCount = store.getState()['features/chat']?.messages?.length || 0;
                store.subscribe(() => {
                    const msgs = store.getState()['features/chat']?.messages;
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
                clearInterval(check);
            }
        }, 1000);
    }, botJoinTime);

    return { browser, page };
}

module.exports = { launchJitsiBrowser };
