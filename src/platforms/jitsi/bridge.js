const config = require('../../config');
const t = require('../../config/i18n');

class JitsiPlayerBridge {
    constructor(getPage) {
        this.getPage = getPage;
    }

    async eval(fn, arg) {
        const p = this.getPage();
        return p && !p.isClosed() ? p.evaluate(fn, arg).catch(() => null) : null;
    }

    sendChatMessage(text) {
        return this.eval(msg => {
            try {
                window.APP?.store?.getState()?.['features/base/conference']?.conference?.sendTextMessage(msg);
            } catch {}
        }, text);
    }

    playTrack(ytUrl, vol) {
        return this.eval(async ({ ytUrl, vol, port }) => {
            const ctx = window.botAudioContext;
            if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});
            try {
                if (window.APP?.conference?.isLocalAudioMuted?.()) window.APP.conference.muteAudio(false);
            } catch {}

            const a = window.botAudioElement;
            if (!a) return;

            window.isManuallyStopped = true;
            a.onended = a.onerror = null;
            a.pause();
            a.removeAttribute('src');
            window.isManuallyStopped = false;

            if (window.botGainNode) window.botGainNode.gain.value = vol;

            let done = false;
            const end = (fn, arg) => {
                if (done || window.isManuallyStopped) return;
                done = true;
                if (typeof fn === 'function') fn(arg);
            };

            a.onerror = () => end(window.onTrackError, `Audio Error Code: ${a.error?.code}`);
            a.onended = () => end(window.onTrackEnded);

            a.src = `http://127.0.0.1:${port}/audio-stream?url=${encodeURIComponent(ytUrl)}&t=${Date.now()}`;
            try {
                await a.play();
            } catch (e) {
                if (e.name !== 'AbortError') end(window.onTrackError, `Play API Error: ${e.message}`);
            }
        }, { ytUrl, vol, port: config.port });
    }

    stopTrack() {
        return this.eval(() => {
            const a = window.botAudioElement;
            if (!a) return;
            window.isManuallyStopped = true;
            a.onended = a.onerror = null;
            a.pause();
            a.removeAttribute('src');
        });
    }

    async pauseTrack() {
        await this.eval(() => window.botAudioElement?.pause());
        return this.sendChatMessage(t('j_pause'));
    }

    async resumeTrack() {
        await this.eval(async () => {
            const ctx = window.botAudioContext;
            if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});
            try {
                if (window.APP?.conference?.isLocalAudioMuted?.()) window.APP.conference.muteAudio(false);
            } catch {}
            await window.botAudioElement?.play().catch(() => {});
        });
        return this.sendChatMessage(t('j_resume'));
    }

    async setVolume(vol) {
        const factor = vol / 100;
        await this.eval(v => {
            if (window.botGainNode) window.botGainNode.gain.value = v;
        }, factor);
        await this.sendChatMessage(t('j_volume', { vol }));
        return factor;
    }

    async getCurrentTime() {
        return (await this.eval(() => window.botAudioElement?.currentTime)) || 0;
    }
}

module.exports = JitsiPlayerBridge;