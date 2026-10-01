const config = require('../../config');

class PlayerState {
    constructor() {
        this.reset();
    }

    reset() {
        Object.assign(this, {
            queue: [],
            history: [],
            currentTrack: null,
            isPlaying: false,
            currentVolume: config.defaultVolume,
            loopMode: 'off',
            isRadioMode: false,
            isFetchingRadio: false,
            isHandlingEnd: false,
            isStartingTrack: false
        });
    }

    enqueue(tracks, asNext = false) {
        this.queue[asNext ? 'unshift' : 'push'](...(Array.isArray(tracks) ? tracks : [tracks]));
    }

    dequeue() {
        return (this.currentTrack = this.queue.shift() || null);
    }

    addToHistory(track) {
        if (track) {
            this.history = [track, ...this.history.slice(0, Math.max(0, config.historyLimit - 1))];
        }
    }

    clearQueue() {
        this.queue.length = 0;
    }

    shuffleQueue() {
        if (this.queue.length < 2) return false;
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        return true;
    }

    moveTrack(from, to) {
        if (from >= 0 && from < this.queue.length && to >= 0 && to <= this.queue.length) {
            this.queue.splice(to, 0, this.queue.splice(from, 1)[0]);
            return true;
        }
        return false;
    }

    removeTrack(index) {
        return (index >= 0 && index < this.queue.length) ? this.queue.splice(index, 1)[0] : null;
    }

    setVolume(volPercent) {
        return (this.currentVolume = Math.max(0, Math.min(100, volPercent)) / 100);
    }

    getForbiddenUrls() {
        return new Set([
            this.currentTrack?.url,
            ...this.history.map(t => t.url),
            ...this.queue.map(t => t.url)
        ].filter(Boolean));
    }

    shouldTriggerRadio() {
        return this.isRadioMode && !this.queue.length && Boolean(this.currentTrack);
    }

    getStatus(roomName, isConnected) {
        if (!isConnected) return { isConnected: false };
        return {
            isConnected: true,
            roomName: roomName || null,
            isPlaying: this.isPlaying,
            currentTrack: this.currentTrack?.title || null,
            queueLength: this.queue.length,
            isRadioMode: this.isRadioMode,
            volume: Math.round(this.currentVolume * 100),
            loopMode: this.loopMode
        };
    }
}

module.exports = { PlayerState };
