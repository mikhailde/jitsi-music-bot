const { execFile } = require('child_process');
const { promisify } = require('util');
const ytDlp = require('youtube-dl-exec');
const config = require('../../config');
const log = require('../../utils/logger');

const execFileAsync = promisify(execFile);
const YT_BIN = require.resolve('youtube-dl-exec/bin/yt-dlp');
const URL_REGEX = /^(https?:\/\/|(www\.)?(youtube\.com|youtu\.be))/i;

async function updateYtDlp() {
    try {
        log.info('YTDLP', 'Updating core binary...');
        await execFileAsync(YT_BIN, ['-U']);
        log.info('YTDLP', 'Core binary updated successfully');
    } catch (err) {
        log.warn('YTDLP', 'Failed to update binary (using current version)');
        log.debug('YTDLP', 'Update error details:', err.message);
    }
}

async function getTrackInfo(query, playlistItems = null) {
    const q = (query || '').trim();
    if (!q) return null;

    const isUrl = URL_REGEX.test(q);
    const itemsLimit = playlistItems || (isUrl ? `1-${config.maxPlaylistItems}` : null);

    const args = {
        print: '%(id)s\t%(duration)s\t%(title)s',
        flatPlaylist: true,
        noWarnings: true,
        quiet: true,
        jsRuntimes: 'deno',
        ...(itemsLimit && { playlistItems: itemsLimit }),
        ...(config.proxy && { proxy: config.proxy })
    };

    const start = performance.now();
    try {
        log.debug('YTDLP', `Search: "${q}"`);
        const raw = await ytDlp(isUrl ? q : `ytsearch1:${q}`, args);
        const tracks = [];

        for (const line of (raw || '').trim().split('\n')) {
            if (!line) continue;
            const [id, dur, ...rest] = line.split('\t');
            const title = rest.join('\t').trim();

            if (id && title) {
                tracks.push({
                    title,
                    url: `https://www.youtube.com/watch?v=${id.trim()}`,
                    duration: parseInt(dur, 10) || 0
                });
            }
        }

        log.debug('YTDLP', `Tracks found: ${tracks.length} (${((performance.now() - start) / 1000).toFixed(2)}s)`);
        return tracks;
    } catch (e) {
        log.error('YTDLP', `Search error for "${q}":`, e.message);
        return null;
    }
}

module.exports = { updateYtDlp, getTrackInfo };