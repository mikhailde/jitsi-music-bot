const http = require('http');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const ytDlp = require('youtube-dl-exec');
const config = require('../config');
const log = require('../utils/logger');
const t = require('../config/i18n');

const execAsync = promisify(exec);

async function updateYtDlp() {
    try {
        log.info('AUDIO', t('log_audio_updating'));
        await execAsync(`"${require.resolve('youtube-dl-exec/bin/yt-dlp')}" -U`);
        log.info('AUDIO', t('log_audio_updated'));
    } catch {
        log.warn('AUDIO', t('log_audio_upd_err'));
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
        log.debug('YTDLP', t('log_ytdlp_search', { query }));
        const raw = await ytDlp(query.startsWith('http') ? query : `ytsearch1:${query}`, args);
        const tracks = raw.trim().split('\n').filter(Boolean).map(line => {
            const [title, url, dur] = line.split('|');
            return title && url ? { title, url, duration: parseInt(dur, 10) || 0 } : null;
        }).filter(Boolean);

        log.debug('YTDLP', t('log_ytdlp_found', { count: tracks.length, time: ((performance.now() - start) / 1000).toFixed(2) }));
        return tracks;
    } catch (e) {
        log.error('YTDLP', t('log_ytdlp_err', { query }), e.message);
        return null;
    }
}

function pipeAudioStream(url, res, req) {
    log.info('AUDIO', t('log_audio_stream', { bitrate: config.audioBitrate, url: url.slice(0, 60) }));
    const args = {
        output: '-',
        format: 'bestaudio/best',
        quiet: true,
        noWarnings: true,
        jsRuntimes: 'deno',
        ...(config.proxy ? { proxy: config.proxy } : {})
    };

    const yt = ytDlp.exec(url, args);
    const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', config.audioBitrate, '-v', 'error', '-f', 'webm', 'pipe:1'
    ]);

    [yt.stdout, ffmpeg.stdin, ffmpeg.stdout].forEach(s => s?.on('error', () => {}));
    yt.stdout.pipe(ffmpeg.stdin);

    ffmpeg.stderr.on('data', d => {
        const msg = d.toString();
        if (msg.includes('error') && !msg.includes('Connection reset by peer')) log.error('FFMPEG', msg.trim());
    });

    let closed = false;
    const cleanup = () => {
        if (closed) return;
        closed = true;
        log.debug('AUDIO', t('log_audio_closed'));
        yt.child?.kill('SIGKILL');
        ffmpeg.kill('SIGKILL');
    };

    req.on('close', cleanup);
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/webm' });
    ffmpeg.stdout.pipe(res);
}

function startAudioServer() {
    return new Promise(async (resolve) => {
        await updateYtDlp();
        http.createServer((req, res) => {
            const u = new URL(req.url, 'http://127.0.0.1');
            const target = req.method === 'GET' && u.pathname === '/audio-stream' && u.searchParams.get('url');
            if (target) {
                pipeAudioStream(target, res, req);
            } else {
                res.writeHead(u.pathname === '/audio-stream' ? 400 : 404).end();
            }
        }).listen(config.port, '0.0.0.0', function() {
            log.info('AUDIO', t('log_audio_listen', { port: config.port }));
            resolve(this);
        });
    });
}

module.exports = { startAudioServer, getTrackInfo };
