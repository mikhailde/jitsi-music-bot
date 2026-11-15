const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('../../config');
const log = require('../../utils/logger');

const execFileAsync = promisify(execFile);
const YT_BIN = require.resolve('youtube-dl-exec/bin/yt-dlp');
const SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const extractYtError = (err) => {
    const stderr = err?.stderr?.trim();
    return stderr?.match(/ERROR:\s*(.+)/)?.[1]?.trim()
        || stderr?.split('\n').pop()?.trim()
        || (err?.killed ? `Timed out (${err.signal || 'SIGTERM'})` : `Exit code ${err?.code ?? 'unknown'}`);
};

const resolveTarget = (q) => {
    const hasScheme = SCHEME_REGEX.test(q);
    if (/\s/.test(q) || (!hasScheme && (!q.includes('/') || !YT_HOSTS.has(q.split('/', 1)[0].toLowerCase())))) {
        return hasScheme ? null : { target: `ytsearch1:${q}`, isUrl: false };
    }
    try {
        const u = new URL(hasScheme ? q : `https://${q}`);
        return /^https?:$/.test(u.protocol) && YT_HOSTS.has(u.hostname.toLowerCase()) && (u.pathname !== '/' || u.search)
            ? { target: u.toString(), isUrl: true }
            : null;
    } catch {
        return null;
    }
};

let updatePromise = null;

function updateYtDlp() {
    return (updatePromise ??= (async () => {
        try {
            log.info('YTDLP', 'Updating core binary (nightly)...');
            await execFileAsync(YT_BIN, ['--update-to', 'nightly', ...(config.proxy ? ['--proxy', config.proxy] : [])], { timeout: 90000 });
            log.info('YTDLP', 'Core binary updated successfully');
        } catch (err) {
            log.warn('YTDLP', 'Failed to update binary (using current version)');
            log.debug('YTDLP', 'Update error details:', extractYtError(err));
        } finally {
            updatePromise = null;
        }
    })());
}

async function getTrackInfo(query, playlistItems = null) {
    const q = (query || '').trim();
    if (!q) return null;

    const resolved = resolveTarget(q);
    if (!resolved) {
        log.warn('YTDLP', `Blocked invalid or non-YouTube URL: ${q}`);
        return [];
    }

    const { target, isUrl } = resolved;
    const itemsLimit = playlistItems || (isUrl ? `1-${config.maxPlaylistItems}` : null);
    const args = [
        '--print', '%(id)s\t%(duration)s\t%(title)s',
        '--flat-playlist',
        '--no-warnings',
        '--js-runtimes', 'deno',
        ...(itemsLimit ? ['--playlist-items', itemsLimit] : []),
        ...(config.proxy ? ['--proxy', config.proxy] : []),
        ...(config.potProviderUrl ? [
            '--extractor-args', `youtubepot-bgutilhttp:base_url=${config.potProviderUrl}`,
            '--extractor-args', 'youtube:player-client=mweb,tv,web_safari'
        ] : []),
        '--',
        target
    ];

    const start = performance.now();
    try {
        log.debug('YTDLP', `Search: "${q}"`);
        const { stdout } = await execFileAsync(YT_BIN, args, { timeout: 45000, maxBuffer: 10 * 1024 * 1024 });
        const tracks = [];

        for (const line of (stdout || '').trim().split('\n')) {
            if (!line) continue;
            const [rawId, dur, ...rest] = line.split('\t');
            const id = rawId?.trim();
            const title = rest.join('\t').trim();

            if (YT_ID_REGEX.test(id) && title && !/^\[(Private|Deleted) video\]$/.test(title)) {
                tracks.push({ title, url: `https://www.youtube.com/watch?v=${id}`, duration: parseInt(dur, 10) || 0 });
            }
        }

        log.debug('YTDLP', `Tracks found: ${tracks.length} (${((performance.now() - start) / 1000).toFixed(2)}s)`);
        return tracks;
    } catch (e) {
        log.error('YTDLP', `Search error for "${q}":`, extractYtError(e));
        return null;
    }
}

module.exports = { updateYtDlp, getTrackInfo };