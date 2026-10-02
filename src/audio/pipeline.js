const { spawn } = require('child_process');
const ytDlp = require('youtube-dl-exec');
const config = require('../config');
const log = require('../utils/logger');

const killProcessGroup = (child) => {
    if (!child?.pid) return;
    try { process.kill(-child.pid, 'SIGKILL'); } catch {
        try { child.kill('SIGKILL'); } catch {}
    }
};

function pipeAudioStream(url, res, req) {
    log.info('AUDIO', `Stream started [${config.audioBitrate}]: ${url.slice(0, 60)}...`);

    const yt = ytDlp.exec(url, {
        output: '-',
        format: 'bestaudio/best',
        noWarnings: true,
        jsRuntimes: 'deno',
        ...(config.proxy ? { proxy: config.proxy } : {})
    }, { detached: true });

    const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', config.audioBitrate, '-v', 'error', '-f', 'webm', 'pipe:1'
    ], { detached: true });

    let closed = false;
    let headersSent = false;

    const cleanup = () => {
        if (closed) return;
        closed = true;
        log.debug('AUDIO', 'Stream closed');

        // Моментально освобождаем буферы потоков в памяти
        [yt.stdout, yt.stderr, ffmpeg.stdin, ffmpeg.stdout, ffmpeg.stderr].forEach(s => s?.destroy());
        killProcessGroup(yt);
        killProcessGroup(ffmpeg);
    };

    const fail = (prefix, msg) => {
        if (closed) return;
        if (msg) log.error(prefix, msg);
        if (!headersSent && !res.headersSent) res.writeHead(502).end();
        cleanup();
    };

    // Глушим EPIPE при обрыве каналов между процессами
    [yt.stdout, ffmpeg.stdin, ffmpeg.stdout].forEach(s => s?.on('error', () => {}));
    yt.stdout.pipe(ffmpeg.stdin);

    yt.stderr?.on('data', d => {
        const msg = d.toString().trim();
        if (msg && !msg.includes('WARNING')) log.debug('YTDLP', msg);
    });

    // Защита от сбоя спавна FFmpeg
    ffmpeg.on('error', err => fail('FFMPEG', `Process error: ${err.message}`));
    ffmpeg.stderr.on('data', d => {
        const msg = d.toString();
        if (msg.includes('error') && !msg.includes('Connection reset by peer')) {
            log.error('FFMPEG', msg.trim());
        }
    });

    ffmpeg.stdout.once('data', chunk => {
        if (closed) return;
        headersSent = true;
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/webm' });
        res.write(chunk);
        ffmpeg.stdout.pipe(res);
    });

    ffmpeg.stdout.once('end', () => {
        if (!headersSent) fail('FFMPEG', 'Stream ended unexpectedly without audio data');
    });

    yt.catch(err => {
        if (closed) return;
        const msg = err.stderr?.match(/ERROR:\s*(.+)/)?.[1] || err.shortMessage || 'Stream failed';
        if (!msg.includes('SIGKILL') && !msg.includes('EPIPE')) {
            fail('YTDLP', msg);
        } else {
            cleanup();
        }
    });

    req.on('close', cleanup);
}

module.exports = { pipeAudioStream };