const config = require('../../config');
const t = require('../../config/i18n');

class JitsiPlayerBridge {
    constructor(getPage) {
        this.getPage = getPage;
    }

    async eval(fn, arg, strict = false) {
        const p = this.getPage();
        if (!p || p.isClosed()) {
            if (strict) throw new Error('Browser page is not available');
            return null;
        }
        return strict ? p.evaluate(fn, arg) : p.evaluate(fn, arg).catch(() => null);
    }

    sendChatMessage(text) {
        return this.eval(msg => {
            try {
                window.APP?.store?.getState()?.['features/base/conference']?.conference?.sendTextMessage(msg);
            } catch {}
        }, text);
    }

    async playTrack(ytUrl, vol) {
        const started = await this.eval(async ({ ytUrl, vol, port }) => {
            const a = window.botAudioElement;
            if (!a) return false;

            const ctx = window.botAudioContext;
            if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});
            try {
                if (window.APP?.conference?.isLocalAudioMuted?.()) window.APP.conference.muteAudio(false);
            } catch {}

            const gen = (window.botPlayGen = (window.botPlayGen || 0) + 1);
            a.pause();

            if (window.botGainNode) window.botGainNode.gain.value = vol;

            const end = (fn, arg) => {
                if (gen !== window.botPlayGen) return;
                window.botPlayGen++;
                if (typeof fn === 'function') fn(arg);
            };

            a.onerror = () => end(window.onTrackError, `Audio Error Code: ${a.error?.code}`);
            a.onended = () => end(window.onTrackEnded);

            a.src = `http://127.0.0.1:${port}/audio-stream?url=${encodeURIComponent(ytUrl)}&t=${Date.now()}`;
            a.play().catch(e => {
                if (e.name !== 'AbortError') end(window.onTrackError, `Play API Error: ${e.message}`);
            });
            return true;
        }, { ytUrl, vol, port: config.port }, true);

        if (!started) throw new Error('Audio element not initialized');
    }

    stopTrack() {
        return this.eval(() => {
            window.botPlayGen = (window.botPlayGen || 0) + 1;
            const a = window.botAudioElement;
            if (!a) return;
            a.onended = a.onerror = null;
            a.pause();
            if (a.hasAttribute('src')) {
                a.removeAttribute('src');
                a.load();
            }
        });
    }

    async pauseTrack() {
        const paused = await this.eval(() => {
            const a = window.botAudioElement;
            if (!a || a.paused) return false;
            a.pause();
            return true;
        });
        if (paused) await this.sendChatMessage(t('j_pause'));
        return Boolean(paused);
    }

    async resumeTrack() {
        const resumed = await this.eval(async () => {
            const a = window.botAudioElement;
            if (!a || !a.src || !a.paused) return false;

            const ctx = window.botAudioContext;
            if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});
            try {
                if (window.APP?.conference?.isLocalAudioMuted?.()) window.APP.conference.muteAudio(false);
            } catch {}

            try {
                await a.play();
                return true;
            } catch {
                return false;
            }
        });
        if (resumed) await this.sendChatMessage(t('j_resume'));
        return Boolean(resumed);
    }

    async setVolume(vol) {
        await this.eval(v => {
            if (window.botGainNode) window.botGainNode.gain.value = v;
        }, vol / 100);
        await this.sendChatMessage(t('j_volume', { vol }));
    }

    async getCurrentTime() {
        return (await this.eval(() => window.botAudioElement?.currentTime)) || 0;
    }
}

module.exports = JitsiPlayerBridge;