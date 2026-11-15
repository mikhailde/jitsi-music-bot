const { spawn } = require('child_process');
const config = require('../config');
const log = require('../utils/logger');

const YT_BIN = require.resolve('youtube-dl-exec/bin/yt-dlp');

const killProcessGroup = (child) => {
    if (!child?.pid) return;
    try { process.kill(-child.pid, 'SIGKILL'); } catch {
        try { child.kill('SIGKILL'); } catch {}
    }
};

function pipeAudioStream(url, res) {
    log.info('AUDIO', `Stream started [${config.audioBitrate}]: ${url}`);

    const yt = spawn(YT_BIN, [
        '-o', '-',
        '-f', 'bestaudio[acodec=opus]/bestaudio/best',
        '--no-playlist',
        '--no-progress',
        '--no-warnings',
        '--retries', '3',
        '--fragment-retries', '3',
        '--js-runtimes', 'deno',
        ...(config.proxy ? ['--proxy', config.proxy] : []),
        ...(config.potProviderUrl ? [
            '--extractor-args', `youtubepot-bgutilhttp:base_url=${config.potProviderUrl}`,
            '--extractor-args', 'youtube:player-client=mweb,tv,web_safari'
        ] : []),
        '--',
        url
    ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

    const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0', '-vn', '-ac', '2', '-ar', '48000',
        '-c:a', 'libopus', '-b:a', config.audioBitrate, '-v', 'error', '-f', 'webm', 'pipe:1'
    ], { detached: true });

    let closed = false;
    let ytExited = false;
    let ffmpegExited = false;
    let ytStderr = '';

    const cleanup = () => {
        if (closed) return;
        closed = true;
        log.debug('AUDIO', 'Stream closed');

        [...yt.stdio, ...ffmpeg.stdio].forEach(s => s?.destroy());
        if (!ytExited) killProcessGroup(yt);
        if (!ffmpegExited) killProcessGroup(ffmpeg);
    };

    const fail = (prefix, msg) => {
        if (closed) return;
        if (msg) log.error(prefix, msg);
        if (!res.headersSent && !res.destroyed) {
            res.writeHead(502, { 'Access-Control-Allow-Origin': '*' }).end();
        } else if (!res.destroyed) {
            res.destroy();
        }
        cleanup();
    };

    [yt.stdout, ffmpeg.stdin, ffmpeg.stdout, res].forEach(s => s.on('error', () => {}));
    yt.stdout.pipe(ffmpeg.stdin, { end: false });

    yt.stderr.on('data', d => {
        const text = d.toString();
        ytStderr = (ytStderr + text).slice(-4000);
        const trimmed = text.trim();
        if (trimmed) log.debug('YTDLP', trimmed);
    });

    yt.on('error', err => fail('YTDLP', `Process error: ${err.message}`));
    yt.on('close', (code, signal) => {
        ytExited = true;
        if (closed) return;
        if (code === 0) return ffmpeg.stdin.end();

        const stderr = ytStderr.trim();
        const msg = stderr.match(/ERROR:\s*(.+)/)?.[1]?.trim()
            || stderr.split('\n').pop()?.trim()
            || `Process exited with code ${code ?? signal}`;
        fail('YTDLP', msg);
    });

    ffmpeg.on('error', err => fail('FFMPEG', `Process error: ${err.message}`));
    ffmpeg.on('close', (code, signal) => {
        ffmpegExited = true;
        if (closed) return;
        if (code === 0 && res.headersSent) {
            res.end();
            cleanup();
        } else {
            fail('FFMPEG', code === 0 ? 'Stream ended unexpectedly without audio data' : `Process exited with code ${code ?? signal}`);
        }
    });
    ffmpeg.stderr.on('data', d => {
        if (closed) return;
        const msg = d.toString().trim();
        if (msg && !msg.includes('Connection reset by peer') && !msg.includes('Broken pipe')) {
            log.error('FFMPEG', msg);
        }
    });

    ffmpeg.stdout.once('data', chunk => {
        if (closed) return;
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/webm' });
        res.write(chunk);
        ffmpeg.stdout.pipe(res, { end: false });
    });

    res.on('close', cleanup);
}

module.exports = { pipeAudioStream };