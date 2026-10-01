const { exec } = require('child_process');
const { promisify } = require('util');
const ytDlp = require('youtube-dl-exec');
const config = require('../../config');
const log = require('../../utils/logger');

const execAsync = promisify(exec);

async function updateYtDlp() {
    try {
        log.info('AUDIO', 'Updating yt-dlp core...');
        await execAsync(`"${require.resolve('youtube-dl-exec/bin/yt-dlp')}" -U`);
        log.info('AUDIO', 'yt-dlp core updated successfully');
    } catch {
        log.warn('AUDIO', 'Failed to update yt-dlp (using current version)');
    }
}

async function getTrackInfo(query, playlistItems = null) {
    const args = {
        print: '%(title)s|https://www.youtube.com/watch?v=%(id)s|%(duration)s',
        flatPlaylist: true,
        noWarnings: true,
        quiet: true,
        jsRuntimes: 'deno',
        ...(playlistItems ? { playlistItems } : {}),
        ...(config.proxy ? { proxy: config.proxy } : {})
    };

    const start = performance.now();
    try {
        log.debug('YTDLP', `Search: "${query}"`);
        const raw = await ytDlp(query.startsWith('http') ? query : `ytsearch1:${query}`, args);
        const tracks = raw.trim().split('\n').filter(Boolean).map(line => {
            const [title, url, dur] = line.split('|');
            return title && url ? { title, url, duration: parseInt(dur, 10) || 0 } : null;
        }).filter(Boolean);

        log.debug('YTDLP', `Tracks found: ${tracks.length} (${((performance.now() - start) / 1000).toFixed(2)}s)`);
        return tracks;
    } catch (e) {
        log.error('YTDLP', `Search error for "${query}":`, e.message);
        return null;
    }
}

module.exports = { updateYtDlp, getTrackInfo };
