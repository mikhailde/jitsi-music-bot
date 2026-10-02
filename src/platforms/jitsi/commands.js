const config = require('../../config');
const t = require('../../config/i18n');
const log = require('../../utils/logger');
const { formatTime, getProgressBar } = require('../../utils/format');

const loopMap = { track: 'word_loop_1', queue: 'word_loop_q' };

const commands = {
    async '/play'({ cmd, query, state, player, getTrackInfo }) {
        if (!query) return;
        await player.sendChatMessage(t('j_search', { query }));

        const tracks = await getTrackInfo(query);
        if (!tracks?.length) return player.sendChatMessage(t('j_not_found'));

        const isNext = cmd === '/playnext';
        state.enqueue(tracks, isNext);

        if (tracks.length > 1) {
            await player.sendChatMessage(t('j_playlist_loaded', { count: tracks.length }));
        }

        if (!state.isPlaying && !state.isHandlingEnd) {
            await player.playNextInQueue();
        } else if (tracks.length === 1) {
            const tr = tracks[0];
            await player.sendChatMessage(t(isNext ? 'j_added_next' : 'j_added_queue', {
                title: tr.title,
                duration: formatTime(tr.duration),
                url: tr.url
            }));
        }
    },

    async '/skip'({ state, player }) {
        if (state.isPlaying) {
            await player.sendChatMessage(t('j_skip'));
            await player.stopTrack();
            await player.handleTrackEnd(true);
        }
    },

    async '/replay'({ state, player }) {
        const track = state.isPlaying ? state.currentTrack : (state.history[0] || null);
        if (!track) return player.sendChatMessage(t('j_hist_empty'));

        await player.sendChatMessage(t('j_replay'));
        if (state.isPlaying) await player.stopTrack();

        state.enqueue(track, true);
        state.isPlaying = false;
        await player.playNextInQueue();
    },

    async '/radio'({ state, player, fetchRadio }) {
        state.isRadioMode = !state.isRadioMode;
        const seed = state.isRadioMode ? (state.currentTrack || state.history[0] || null) : null;
        state.radioSeedTrack = seed;

        await player.sendChatMessage(t(state.isRadioMode ? 'j_radio_on' : 'j_radio_off'));
        if (state.shouldTriggerRadio()) fetchRadio(seed);
    },

    async '/loop'({ args, state, player, fetchRadio }) {
        const mode = args[1]?.toLowerCase();
        if (['track', 'queue', 'off'].includes(mode)) {
            state.loopMode = mode;
            await player.sendChatMessage(t(`j_loop_${mode}`));
            if (state.shouldTriggerRadio()) fetchRadio(state.radioSeedTrack || state.currentTrack);
        } else {
            const s = t(loopMap[state.loopMode] || 'word_loop_off');
            await player.sendChatMessage(t('j_loop_info', { status: s }));
        }
    },

    async '/shuffle'({ state, player }) {
        const ok = state.shuffleQueue();
        return player.sendChatMessage(t(ok ? 'j_shuffle_ok' : 'j_shuffle_err'));
    },

    async '/move'({ args, state, player }) {
        if (args.length !== 3) return player.sendChatMessage(t('j_move_err_fmt'));
        const from = parseInt(args[1], 10) - 1;
        const to = parseInt(args[2], 10) - 1;
        if (isNaN(from) || isNaN(to)) return player.sendChatMessage(t('j_move_err_fmt'));

        if (state.moveTrack(from, to)) {
            return player.sendChatMessage(t('j_move_ok', { pos: to + 1 }));
        }
        return player.sendChatMessage(t('j_move_err_idx', { count: state.queue.length }));
    },

    async '/clear'({ state, player, fetchRadio }) {
        state.clearQueue();
        await player.sendChatMessage(t('j_clear'));
        if (state.shouldTriggerRadio()) fetchRadio(state.radioSeedTrack || state.currentTrack);
    },

    async '/remove'({ args, state, player, fetchRadio }) {
        const idx = parseInt(args[1], 10) - 1;
        if (isNaN(idx)) return player.sendChatMessage(t('j_remove_err'));

        const removed = state.removeTrack(idx);
        if (removed) {
            await player.sendChatMessage(t('j_remove', { title: removed.title }));
            if (state.shouldTriggerRadio()) fetchRadio(state.radioSeedTrack || state.currentTrack);
        } else {
            await player.sendChatMessage(t('j_remove_err'));
        }
    },

    async '/stop'({ state, player }) {
        await player.stopTrack();
        state.reset();
        return player.sendChatMessage(t('j_stop'));
    },

    async '/pause'({ player }) {
        return player.pauseTrack();
    },

    async '/resume'({ player }) {
        return player.resumeTrack();
    },

    async '/volume'({ args, state, player }) {
        const val = parseInt(args[1], 10);
        if (isNaN(val)) {
            return player.sendChatMessage(t('j_volume_current', { vol: Math.round(state.currentVolume * 100) }));
        }
        await player.setVolume(Math.max(0, Math.min(100, val)));
    },

    async '/np'({ state, player }) {
        if (!state.isPlaying || !state.currentTrack) return player.sendChatMessage(t('j_np_silence'));
        const cur = await player.getCurrentTime();
        const tr = state.currentTrack;
        let msg = t('j_np_playing', {
            title: tr.title,
            bar: `${formatTime(cur)} ${getProgressBar(cur, tr.duration)}`,
            total: formatTime(tr.duration),
            url: tr.url
        });
        if (state.loopMode !== 'off') {
            msg += `\n(${t(loopMap[state.loopMode])})`;
        }
        return player.sendChatMessage(msg);
    },

    async '/queue'({ state, player }) {
        if (!state.queue.length) return player.sendChatMessage(t('j_queue_empty'));
        const list = state.queue.slice(0, config.queuePageSize).map((tr, i) => `${i + 1}. ${tr.title} [${formatTime(tr.duration)}]\n${tr.url}`).join('\n\n');
        const more = state.queue.length > config.queuePageSize ? t('j_queue_more', { count: state.queue.length - config.queuePageSize }) : '';
        return player.sendChatMessage(`${t('j_queue_head', { count: state.queue.length })}${list}${more}`);
    },

    async '/history'({ state, player }) {
        if (!state.history.length) return player.sendChatMessage(t('j_hist_empty'));
        const list = state.history.map((tr, i) => `${i + 1}. ${tr.title} [${formatTime(tr.duration)}]`).join('\n');
        return player.sendChatMessage(`${t('j_hist_head')}${list}`);
    },

    async '/help'({ player }) {
        return player.sendChatMessage(t('j_help'));
    },

    async '/leave'({ player, leaveBot }) {
        await player.sendChatMessage(t('j_leave'));
        setTimeout(leaveBot, 1000);
    }
};

commands['/playnext'] = commands['/play'];
commands['/exit'] = commands['/leave'];

async function dispatch(text, ctx) {
    if (!text?.startsWith('/')) return;
    const trimmed = text.trim();
    const [rawCmd, ...rest] = trimmed.split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const handler = commands[cmd];

    if (typeof handler === 'function') {
        log.info('CMD', trimmed);
        await handler({ cmd, args: [cmd, ...rest], query: rest.join(' '), ...ctx });
    } else {
        log.debug('CMD', `Unknown command: ${trimmed}`);
    }
}

module.exports = { dispatch };