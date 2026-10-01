const config = require('../config');
const t = require('../config/i18n');

class JitsiPlayerBridge {
    constructor(getPage) {
        this.getPage = getPage;
    }

    eval(fn, arg) {
        const p = this.getPage();
        return p ? p.evaluate(fn, arg) : null;
    }

    sendChatMessage(text) {
        return this.eval(msg => {
            try { window.APP?.store?.getState()?.['features/base/conference']?.conference?.sendTextMessage(msg); } catch {}
        }, text);
    }

    playTrack(ytUrl, vol) {
        return this.eval(async ({ ytUrl, vol, port }) => {
            // 1. Активируем AudioContext если он в suspended
            if (window.botAudioContext && window.botAudioContext.state === 'suspended') {
                await window.botAudioContext.resume();
            }

            // 2. Включаем микрофон, если Jitsi замьютил бота при входе
            try {
                if (window.APP?.conference?.isLocalAudioMuted()) {
                    window.APP.conference.muteAudio(false);
                }
            } catch {}

            // 3. Останавливаем предыдущий трек
            const prev = window.currentAudioElement;
            if (prev) {
                window.isManuallyStopped = true;
                prev.onended = prev.onerror = null;
                prev.pause();
                prev.removeAttribute('src');
                prev.load();
            }
            window.isManuallyStopped = false;

            // 4. Используем 127.0.0.1 для исключения таймаута IPv6
            const streamUrl = `http://127.0.0.1:${port}/audio-stream?url=${encodeURIComponent(ytUrl)}&t=${Date.now()}`;
            const audio = new Audio(streamUrl);
            audio.crossOrigin = 'anonymous';
            audio.volume = vol;

            const source = window.botAudioContext.createMediaElementSource(audio);
            source.connect(window.botDestination);

            let done = false;
            const end = (fn, arg) => {
                if (done || window.isManuallyStopped) return;
                done = true;
                fn(arg);
            };

            audio.onerror = () => end(window.onTrackError, `Audio Error Code: ${audio.error?.code}`);
            audio.onended = () => end(window.onTrackEnded);

            try {
                await audio.play();
            } catch (e) {
                if (e.name !== 'AbortError') end(window.onTrackError, `Play API Error: ${e.message}`);
            }

            window.currentAudioElement = audio;
        }, { ytUrl, vol, port: config.port });
    }

    stopTrack() {
        return this.eval(() => {
            const a = window.currentAudioElement;
            if (a) {
                window.isManuallyStopped = true;
                a.onended = a.onerror = null;
                a.pause();
                a.removeAttribute('src');
                a.load();
                window.currentAudioElement = null;
            }
        });
    }

    async pauseTrack() {
        await this.eval(() => window.currentAudioElement?.pause());
        return this.sendChatMessage(t('j_pause'));
    }

    async resumeTrack() {
        await this.eval(async () => {
            if (window.botAudioContext?.state === 'suspended') await window.botAudioContext.resume();
            await window.currentAudioElement?.play();
        });
        return this.sendChatMessage(t('j_resume'));
    }

    async setVolume(vol) {
        const factor = vol / 100;
        await this.eval(v => { if (window.currentAudioElement) window.currentAudioElement.volume = v; }, factor);
        await this.sendChatMessage(t('j_volume', { vol }));
        return factor;
    }

    async getCurrentTime() {
        return (await this.eval(() => window.currentAudioElement?.currentTime)) || 0;
    }
}

module.exports = JitsiPlayerBridge;
