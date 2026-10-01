const { spawn } = require('child_process');
const ytDlp = require('youtube-dl-exec');
const config = require('../config');
const log = require('../utils/logger');

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
        if (msg.includes('error') && !msg.includes('Connection reset by peer')) {
            log.error('FFMPEG', msg.trim());
        }
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

    ffmpeg.stdout.once('data', (chunk) => {
        if (closed) return;
        headersSent = true;
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/webm' });
        res.write(chunk);
        ffmpeg.stdout.pipe(res);
    });

    ffmpeg.stdout.once('end', () => {
        if (!headersSent && !res.headersSent && !closed) {
            log.error('FFMPEG', 'Stream ended unexpectedly without audio data');
            cleanup();
            res.writeHead(502).end();
        }
    });

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

module.exports = { pipeAudioStream };
