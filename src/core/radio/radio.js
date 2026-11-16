const config = require('../../config');
const { getTrackInfo } = require('../../audio');
const t = require('../../config/i18n');
const log = require('../../utils/logger');

const YT_ID_REGEX = /(?:v=|\/shorts\/|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const mixCache = new Map();

async function getMix(id) {
    if (mixCache.has(id)) return mixCache.get(id);

    let tracks = await getTrackInfo(`https://www.youtube.com/watch?v=${id}&list=RDAMVM${id}`, `1-${config.radioItemsLimit}`);
    if (!tracks || tracks.length <= 1) {
        tracks = await getTrackInfo(`https://www.youtube.com/watch?v=${id}&list=RD${id}`, `1-${config.radioItemsLimit}`);
    }
    if (tracks?.length) {
        if (mixCache.size >= 20) mixCache.delete(mixCache.keys().next().value);
        mixCache.set(id, tracks);
    }
    return tracks;
}

async function fetchNextRadioTrack({ state, playNextInQueue, sendChat, track }) {
    if (!state.isRadioMode || state.isFetchingRadio || state.queue.length) return;

    const seed = (state.radioSeedTrack ||= track || state.currentTrack || state.history[0]);
    if (!seed?.url) return;

    state.isFetchingRadio = true;
    let nextTrack = null;

    try {
        const fallback = [state.currentTrack, ...state.history].find(h => h?.url && h.url !== seed.url);
        const candidates = [seed, fallback].filter(Boolean);

        for (const currentSeed of candidates) {
            const id = currentSeed.url.match(YT_ID_REGEX)?.[1];
            if (!id) continue;

            const tracks = await getMix(id);
            if (!state.isRadioMode || state.queue.length || state.radioSeedTrack !== seed) return;
            if (!tracks?.length) continue;

            const forbidden = state.getForbiddenUrls();
            const fresh = tracks.filter(tr => !forbidden.has(tr.url));
            log.debug('RADIO', `Mix "${currentSeed.title}": ${tracks.length} found, ${fresh.length} fresh`);

            if (fresh[0]) {
                nextTrack = fresh[0];
                state.radioSeedTrack = currentSeed;
                state.enqueue(nextTrack);
                log.debug('RADIO', `Next track queued: "${nextTrack.title}" (mix of: "${currentSeed.title}")`);
                break;
            }

            log.debug('RADIO', `Pool exhausted for "${currentSeed.title}"`);
        }

        if (!nextTrack) {
            log.info('RADIO', `All candidate pools exhausted (${candidates.length} checked), resetting anchor track`);
            state.radioSeedTrack = null;
            await sendChat?.(t('j_radio_exhausted'));
        }
    } catch (err) {
        log.debug('RADIO', 'Radio track fetch error:', err.message);
    } finally {
        state.isFetchingRadio = false;
    }

    if (nextTrack && !state.isPlaying) await playNextInQueue();
}

module.exports = { fetchNextRadioTrack };