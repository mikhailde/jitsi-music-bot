const config = require('./index');
const idx = config.lang === 'en' ? 1 : 0;

const T = {
    tg_start: [
        'Музыкальный бот Jitsi\n\nКоманды:\n/join <комната или ссылка> — подключить к звонку\n/status — состояние плеера и очередь\n/leave — отключить от звонка',
        'Jitsi Music Bot\n\nCommands:\n/join <room or URL> — connect to call\n/status — player state and queue\n/leave — disconnect from call'
    ],
    tg_empty_room: [
        'Укажите имя комнаты или ссылку:\n/join my-room',
        'Specify a room name or URL:\n/join my-room'
    ],
    tg_joining: ['Подключение к: {room}...', 'Connecting to: {room}...'],
    tg_joined: [
        'Бот подключен к звонку: {url}\nУправление музыкой доступно в чате Jitsi.',
        'Bot connected to meeting: {url}\nControl playback directly in Jitsi chat.'
    ],
    tg_busy: [
        'Бот уже находится в другой комнате.\nИспользуйте /status или /leave.',
        'Bot is already in another room.\nUse /status or /leave.'
    ],
    tg_error: ['Ошибка: {error}', 'Error: {error}'],
    tg_left: ['Бот отключился от звонка.', 'Bot left the call.'],
    tg_status_free: [
        'Бот свободен.\nПодключить: /join <комната>',
        'Bot is currently idle.\nConnect: /join <room>'
    ],
    tg_status_busy: [
        'В звонке: {url}\nТрек: {track}\nОчередь: {queue}\nГромкость: {volume}%\nПовтор: {loop}\nРадио: {radio}',
        'In call: {url}\nTrack: {track}\nQueue: {queue}\nVolume: {volume}%\nLoop: {loop}\nRadio: {radio}'
    ],
    tg_auth_err: [
        'Доступ ограничен (ваш Telegram ID: {userId}).',
        'Access denied (your Telegram ID: {userId}).'
    ],

    j_search: ['Поиск: {query}...', 'Searching: {query}...'],
    j_not_found: ['Ничего не найдено.', 'Nothing found.'],
    j_playlist_loaded: ['Плейлист загружен: добавлено {count} треков', 'Playlist loaded: added {count} tracks'],
    j_play_now: ['▶ Играет [{duration}]: {title}\n{url}', '▶ Playing [{duration}]: {title}\n{url}'],
    j_added_next: ['⏭ Следующий [{duration}]: {title}\n{url}', '⏭ Next [{duration}]: {title}\n{url}'],
    j_added_queue: ['Добавлено в очередь [{duration}]: {title}\n{url}', 'Added to queue [{duration}]: {title}\n{url}'],
    j_skip: ['Трек пропущен.', 'Track skipped.'],
    j_replay: ['Перезапуск трека.', 'Replaying track.'],
    j_stop: ['Воспроизведение остановлено, очередь очищена.', 'Playback stopped, queue cleared.'],
    j_pause: ['⏸ Пауза.', '⏸ Paused.'],
    j_resume: ['▶ Воспроизведение.', '▶ Resumed.'],
    j_err_track: ['Ошибка воспроизведения трека, пропуск:\n{title}', 'Playback error, skipping:\n{title}'],

    j_volume: ['Громкость: {vol}%', 'Volume: {vol}%'],
    j_volume_current: [
        'Громкость: {vol}% (изменить: /volume <0-100>)',
        'Volume: {vol}% (change: /volume <0-100>)'
    ],
    j_radio_on: ['Радио: ВКЛЮЧЕНО (автоподбор треков)', 'Radio: ENABLED (autoplay)'],
    j_radio_off: ['Радио: ВЫКЛЮЧЕНО', 'Radio: DISABLED'],
    j_radio_wait: ['Радио: подбор следующего трека...', 'Radio: finding next track...'],
    j_loop_track: ['Повтор трека: ВКЛЮЧЕН', 'Track repeat: ENABLED'],
    j_loop_queue: ['Повтор очереди: ВКЛЮЧЕН', 'Queue repeat: ENABLED'],
    j_loop_off: ['Повтор: ВЫКЛЮЧЕН', 'Repeat: DISABLED'],
    j_loop_info: [
        'Режим повтора: {status}\n\n/loop track — повтор текущего трека\n/loop queue — повтор всей очереди\n/loop off — выключить повтор',
        'Repeat mode: {status}\n\n/loop track — repeat current track\n/loop queue — repeat entire queue\n/loop off — disable repeat'
    ],

    j_np_silence: ['Сейчас ничего не играет.', 'Nothing is playing right now.'],
    j_np_playing: ['Сейчас играет: {title}\n{bar} {total}\n{url}', 'Now playing: {title}\n{bar} {total}\n{url}'],
    j_queue_empty: ['Очередь пуста.', 'Queue is empty.'],
    j_queue_head: ['В очереди ({count}):\n\n', 'In queue ({count}):\n\n'],
    j_queue_more: ['\n...и еще {count} треков в очереди.', '\n...and {count} more tracks in queue.'],
    j_hist_empty: ['История пуста.', 'Playback history is empty.'],
    j_hist_head: ['Сыгранные треки:\n\n', 'Played tracks:\n\n'],
    j_shuffle_err: ['Недостаточно треков для перемешивания.', 'Not enough tracks to shuffle.'],
    j_shuffle_ok: ['Очередь перемешана.', 'Queue shuffled.'],
    j_move_ok: ['Трек перемещен на позицию #{pos}.', 'Track moved to #{pos}.'],
    j_move_err_idx: ['Неверный номер трека (в очереди: {count}).', 'Invalid track number (queue size: {count}).'],
    j_move_err_fmt: ['Формат: /move <откуда> <куда>', 'Format: /move <from> <to>'],
    j_clear: ['Очередь очищена.', 'Queue cleared.'],
    j_remove: ['Удалено из очереди: {title}', 'Removed from queue: {title}'],
    j_remove_err: ['Трек не найден.', 'Track not found.'],

    j_help: [
        'КОМАНДЫ БОТА:\n\nВоспроизведение:\n/play <запрос/URL> — включить трек\n/playnext <запрос/URL> — поставить следующим\n/pause, /resume — пауза / продолжить\n/skip, /replay — пропустить / сначала\n/stop — остановить и сбросить очередь\n\nОчередь и инфо:\n/np — текущий трек с прогресс-баром\n/queue — очередь треков\n/history — история сыгранных треков\n/shuffle — перемешать очередь\n/move <откуда> <куда> — сдвинуть трек\n/remove <номер> — удалить трек\n/clear — очистить очередь\n\nНастройки:\n/volume <0-100> — громкость\n/radio — режим бесконечного радио\n/loop <track|queue|off> — повтор трека или очереди\n\n/leave — покинуть звонок',
        'BOT COMMANDS:\n\nPlayback:\n/play <query/URL> — play track\n/playnext <query/URL> — play next\n/pause, /resume — pause / resume\n/skip, /replay — skip / replay\n/stop — stop and reset queue\n\nQueue & Info:\n/np — current track progress\n/queue — view queue\n/history — played tracks history\n/shuffle — shuffle queue\n/move <from> <to> — move track\n/remove <number> — remove track\n/clear — clear queue\n\nSettings:\n/volume <0-100> — volume level\n/radio — autoplay radio mode\n/loop <track|queue|off> — repeat mode\n\n/leave — leave meeting call'
    ],
    j_leave: ['Отключение от звонка...', 'Leaving the call...'],
    j_afk: [
        'Комната пуста {sec} сек. Бот отключен.',
        'Room has been empty for {sec} sec. Bot disconnected.'
    ],

    word_on: ['ВКЛ', 'ON'],
    word_off: ['ВЫКЛ', 'OFF'],
    word_loop_1: ['Повтор трека', 'Track loop'],
    word_loop_q: ['Повтор очереди', 'Queue loop'],
    word_loop_off: ['Выключен', 'Off']
};

module.exports = (k, p = {}) => (T[k]?.[idx] || T[k]?.[1] || k).replace(/\{(\w+)\}/g, (_, v) => p[v] ?? `{${v}}`);