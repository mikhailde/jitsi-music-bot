const config = require('../../config');
const { getTrackInfo } = require('../../audio');
const log = require('../../utils/logger');

async function fetchNextRadioTrack({ state, playNextInQueue, track }) {
    if (!state.isRadioMode || state.isFetchingRadio || !track?.url) return;
    state.isFetchingRadio = true;

    try {
        const id = track.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
        if (!id) return;

        const tracks = await getTrackInfo(`https://www.youtube.com/watch?v=${id}&list=RD${id}`, `1-${config.radioItemsLimit}`);
        const next = tracks?.find(t => !state.getForbiddenUrls().has(t.url));

        if (next && state.isRadioMode && state.queue.length === 0) {
            state.enqueue(next);
            log.debug('RADIO', `Next track queued: "${next.title}"`);
            if (!state.isPlaying && !state.isHandlingEnd) await playNextInQueue();
        }
    } catch {
    } finally {
        state.isFetchingRadio = false;
    }
}

module.exports = { fetchNextRadioTrack };
