const http = require('http');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const ytDlp = require('youtube-dl-exec');
const config = require('../config');
const log = require('../utils/logger');

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

function pipeAudioStream(url, res, req) {
    log.info('AUDIO', `Stream started [${config.audioBitrate}]: ${url.slice(0, 60)}...`);
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
    let headersSent = false;

    const cleanup = () => {
        if (closed) return;
        closed = true;
        log.debug('AUDIO', 'Stream closed');
        yt.child?.kill('SIGKILL');
        ffmpeg.kill('SIGKILL');
    };

    // 1. Отправка 200 OK при наличии реальных данных
    ffmpeg.stdout.once('data', (chunk) => {
        if (closed) return;
        headersSent = true;
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/webm' });
        res.write(chunk);
        ffmpeg.stdout.pipe(res);
    });

    // 2. Защита от пустого потока (ffmpeg завершился, не выдав ни одного чанка)
    ffmpeg.stdout.once('end', () => {
        if (!headersSent && !res.headersSent && !closed) {
            log.error('FFMPEG', 'Stream ended unexpectedly without audio data');
            cleanup();
            res.writeHead(502).end();
        }
    });

    // 3. Защита от сбоя yt-dlp
    yt.child?.on('exit', (code) => {
        if (code !== 0 && !closed) {
            log.error('YTDLP', `yt-dlp exited with error code ${code}`);
            cleanup();
            if (!headersSent && !res.headersSent) res.writeHead(502).end();
        }
    });

    yt.catch(err => {
        if (!err.message?.includes('SIGKILL') && !err.message?.includes('EPIPE')) {
            log.error('YTDLP', `Stream pipeline error: ${err.message}`);
        }
        if (!headersSent && !res.headersSent) res.writeHead(502).end();
        cleanup();
    });

    req.on('close', cleanup);
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
        }).listen(config.port, '127.0.0.1', function() {
            log.info('AUDIO', `Audio server listening on port ${config.port}`);
            resolve(this);
        });
    });
}

module.exports = { startAudioServer, getTrackInfo };
