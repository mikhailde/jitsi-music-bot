const config = require('../../config');
const t = require('../../config/i18n');
const log = require('../../utils/logger');
const { formatTime, getProgressBar } = require('../../utils/format');

const commands = {
    async '/play'({ cmd, query, state, player, getTrackInfo }) {
        if (!query) return;
        log.info('CMD', `${cmd} "${query}"`);
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
            const msgKey = isNext ? 'j_added_next' : 'j_added_queue';
            await player.sendChatMessage(t(msgKey, {
                title: tr.title,
                duration: formatTime(tr.duration),
                url: tr.url
            }));
        }
    },

    async '/skip'({ state, player }) {
        if (state.isPlaying) {
            log.info('CMD', '/skip');
            await player.sendChatMessage(t('j_skip'));
            await player.stopTrack();
            await player.handleTrackEnd(true);
        }
    },

    async '/replay'({ state, player }) {
        if (state.isPlaying && state.currentTrack) {
            log.info('CMD', '/replay');
            await player.sendChatMessage(t('j_replay'));
            await player.stopTrack();
            state.enqueue(state.currentTrack, true);
            state.isPlaying = false;
            await player.playNextInQueue();
        }
    },

    async '/radio'({ state, player, fetchRadio }) {
        state.isRadioMode = !state.isRadioMode;
        log.info('CMD', `/radio: ${state.isRadioMode ? 'ON' : 'OFF'}`);
        await player.sendChatMessage(state.isRadioMode ? t('j_radio_on') : t('j_radio_off'));
        if (state.shouldTriggerRadio()) fetchRadio(state.currentTrack);
    },

    async '/loop'({ args, state, player, fetchRadio }) {
        const mode = args[1]?.toLowerCase();
        if (['track', 'queue', 'off'].includes(mode)) {
            state.loopMode = mode;
            log.info('CMD', `/loop: ${mode}`);
            await player.sendChatMessage(t(`j_loop_${mode}`));
            if (state.shouldTriggerRadio()) fetchRadio(state.currentTrack);
        } else {
            const s = t(state.loopMode === 'track' ? 'word_loop_1' : state.loopMode === 'queue' ? 'word_loop_q' : 'word_loop_off');
            await player.sendChatMessage(t('j_loop_info', { status: s }));
        }
    },

    async '/shuffle'({ state, player }) {
        const ok = state.shuffleQueue();
        log.info('CMD', `/shuffle: ${ok ? 'ok' : 'insufficient tracks'}`);
        return player.sendChatMessage(t(ok ? 'j_shuffle_ok' : 'j_shuffle_err'));
    },

    async '/move'({ args, state, player }) {
        if (args.length !== 3) return player.sendChatMessage(t('j_move_err_fmt'));
        const [from, to] = [parseInt(args[1], 10) - 1, parseInt(args[2], 10) - 1];
        if (state.moveTrack(from, to)) {
            log.info('CMD', `/move: ${from + 1} -> ${to + 1}`);
            return player.sendChatMessage(t('j_move_ok', { pos: to + 1 }));
        }
        return player.sendChatMessage(t('j_move_err_idx', { count: state.queue.length }));
    },

    async '/clear'({ state, player, fetchRadio }) {
        log.info('CMD', '/clear');
        state.clearQueue();
        await player.sendChatMessage(t('j_clear'));
        if (state.shouldTriggerRadio()) fetchRadio(state.currentTrack);
    },

    async '/remove'({ args, state, player, fetchRadio }) {
        if (args.length <= 1) return;
        const idx = parseInt(args[1], 10) - 1;
        const removed = state.removeTrack(idx);
        if (removed) {
            log.info('CMD', `/remove: #${idx + 1} "${removed.title}"`);
            await player.sendChatMessage(t('j_remove', { title: removed.title }));
            if (state.shouldTriggerRadio()) fetchRadio(state.currentTrack);
        } else {
            await player.sendChatMessage(t('j_remove_err'));
        }
    },

    async '/stop'({ state, player }) {
        log.info('CMD', '/stop');
        await player.stopTrack();
        state.reset();
        return player.sendChatMessage(t('j_stop'));
    },

    async '/pause'({ player }) {
        log.info('CMD', '/pause');
        return player.pauseTrack();
    },

    async '/resume'({ player }) {
        log.info('CMD', '/resume');
        return player.resumeTrack();
    },

    async '/volume'({ args, state, player }) {
        if (args[1] === undefined) {
            const cur = Math.round(state.currentVolume * 100);
            return player.sendChatMessage(t('j_volume_current', { vol: cur }));
        }
        const val = Math.max(0, Math.min(100, parseInt(args[1], 10) || 50));
        log.info('CMD', `/volume: ${val}%`);
        await player.setVolume(val);
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
            msg += `\n(${t(state.loopMode === 'track' ? 'word_loop_1' : 'word_loop_q')})`;
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

    async '/help'({ player }) { return player.sendChatMessage(t('j_help')); },

    async '/leave'({ player, leaveBot }) {
        log.info('CMD', '/leave');
        await player.sendChatMessage(t('j_leave'));
        setTimeout(leaveBot, 1000);
    }
};

commands['/playnext'] = commands['/play'];
commands['/exit'] = commands['/leave'];

async function dispatch(text, ctx) {
    if (!text?.startsWith('/')) return;
    const [cmd, ...rest] = text.trim().split(/\s+/);
    const handler = commands[cmd.toLowerCase()];
    if (handler) await handler({ cmd: cmd.toLowerCase(), args: [cmd, ...rest], query: rest.join(' '), ...ctx });
}

module.exports = { dispatch };
