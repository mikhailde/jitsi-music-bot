const config = require('../../config');
const { getTrackInfo } = require('../../audio');
const t = require('../../config/i18n');
const log = require('../../utils/logger');

const YT_ID_REGEX = /(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

async function fetchNextRadioTrack({ state, playNextInQueue, sendChat, track }) {
    if (!state.isRadioMode || state.isFetchingRadio) return;

    const seed = (state.radioSeedTrack ||= track || state.currentTrack || state.history[0]);
    if (!seed?.url) return;

    state.isFetchingRadio = true;

    try {
        const forbidden = state.getForbiddenUrls();
        const candidates = [seed, state.history.find(h => h.url !== seed.url)].filter(Boolean);

        for (const currentSeed of candidates) {
            const id = currentSeed.url.match(YT_ID_REGEX)?.[1];
            if (!id) continue;

            const tracks = await getTrackInfo(`https://www.youtube.com/watch?v=${id}&list=RD${id}`, `1-${config.radioItemsLimit}`);
            if (!tracks?.length) {
                log.debug('RADIO', `No tracks found in mix for "${currentSeed.title}"`);
                continue;
            }

            const fresh = tracks.filter(t => !forbidden.has(t.url));
            log.debug('RADIO', `Mix "${currentSeed.title}": ${tracks.length} found, ${tracks.length - fresh.length} filtered, ${fresh.length} fresh`);

            if (fresh[0]) {
                state.radioSeedTrack = currentSeed;
                if (state.isRadioMode && !state.queue.length) {
                    state.enqueue(fresh[0]);
                    log.debug('RADIO', `Next track queued: "${fresh[0].title}" (mix of: "${currentSeed.title}")`);
                    if (!state.isPlaying) await playNextInQueue();
                }
                return;
            }

            log.debug('RADIO', `Pool exhausted for "${currentSeed.title}"`);
        }

        log.info('RADIO', `All candidate pools exhausted (${candidates.length} checked), resetting anchor track`);
        state.radioSeedTrack = null;
        await sendChat?.(t('j_radio_exhausted'));
    } catch (err) {
        log.debug('RADIO', 'Radio track fetch error:', err.message);
    } finally {
        state.isFetchingRadio = false;
    }
}

module.exports = { fetchNextRadioTrack };