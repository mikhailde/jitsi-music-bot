const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config');
const log = require('../utils/logger');

const YT_BIN = require.resolve('youtube-dl-exec/bin/yt-dlp');
const BASE_YT_ARGS = [
    '-o', '-',
    '-f', 'bestaudio[acodec=opus]/bestaudio/best',
    '--no-playlist',
    '--no-progress',
    '--no-warnings',
    '--retries', '3',
    '--fragment-retries', '3',
    '--js-runtimes', 'deno',
    ...(config.proxy ? ['--proxy', config.proxy] : []),
    ...(config.potProviderUrl ? ['--extractor-args', `youtubepot-bgutilhttp:base_url=${config.potProviderUrl}`] : [])
];

const killProcessGroup = (child) => {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    try { process.kill(-child.pid, 'SIGKILL'); } catch {
        try { child.kill('SIGKILL'); } catch {}
    }
};

function pipeAudioStream(url, res) {
    if (res.destroyed) return;
    log.info('AUDIO', `Stream started [${config.audioBitrate}]: ${url}`);

    const clients = config.potProviderUrl ? ['default', 'web_embedded'] : [null];
    let closed = false;
    let stopAttempt = null;

    const cleanup = () => {
        if (closed) return;
        closed = true;
        log.debug('AUDIO', 'Stream closed');
        stopAttempt?.();
    };

    res.on('error', () => {});
    res.on('close', cleanup);

    const runAttempt = (idx) => {
        if (closed) return;

        const client = clients[idx];
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-'));
        const rmWorkDir = () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} };

        const yt = spawn(YT_BIN, [
            ...BASE_YT_ARGS,
            ...(client ? ['--extractor-args', `youtube:player-client=${client}`] : []),
            '--',
            url
        ], { cwd: workDir, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

        const ffmpeg = spawn('ffmpeg', [
            '-i', 'pipe:0', '-vn', '-ac', '2', '-ar', '48000',
            '-c:a', 'libopus', '-b:a', config.audioBitrate, '-v', 'error', '-f', 'webm', 'pipe:1'
        ], { detached: true });

        let retrying = false;
        let ytStderr = '';

        stopAttempt = () => [yt, ffmpeg].forEach(p => {
            p.stdio.forEach(s => s?.destroy());
            killProcessGroup(p);
        });

        const abort = (prefix, msg) => {
            if (closed || retrying) return;
            if (!res.headersSent && !res.destroyed && idx + 1 < clients.length) {
                retrying = true;
                log.warn('YTDLP', `Client "${client}" failed (${msg}), retrying with "${clients[idx + 1]}"...`);
                stopAttempt();
                return runAttempt(idx + 1);
            }
            log.error(prefix, msg);
            if (!res.headersSent && !res.destroyed) {
                res.writeHead(502, { 'Access-Control-Allow-Origin': '*' }).end();
            } else if (!res.destroyed) {
                res.destroy();
            }
            cleanup();
        };

        [yt.stdout, ffmpeg.stdin, ffmpeg.stdout].forEach(s => s.on('error', () => {}));
        yt.stdout.pipe(ffmpeg.stdin, { end: false });

        yt.stderr.on('data', d => {
            const text = d.toString();
            ytStderr = (ytStderr + text).slice(-4000);
            const trimmed = text.trim();
            if (trimmed) log.debug('YTDLP', trimmed);
        });

        yt.on('error', err => {
            if (!yt.pid) rmWorkDir();
            abort('YTDLP', `Process error: ${err.message}`);
        });

        yt.on('close', (code, signal) => {
            rmWorkDir();
            if (closed || retrying) return;
            if (code === 0) return ffmpeg.stdin.end();

            const stderr = ytStderr.trim();
            abort('YTDLP', stderr.match(/ERROR:\s*(.+)/)?.[1]?.trim()
                || stderr.split('\n').pop()?.trim()
                || `Process exited with code ${code ?? signal}`);
        });

        ffmpeg.on('error', err => abort('FFMPEG', `Process error: ${err.message}`));
        ffmpeg.on('close', (code, signal) => {
            if (closed || retrying) return;
            if (code === 0 && res.headersSent) {
                res.end();
                cleanup();
            } else {
                abort('FFMPEG', code === 0 ? 'Stream ended unexpectedly without audio data' : `Process exited with code ${code ?? signal}`);
            }
        });

        ffmpeg.stderr.on('data', d => {
            if (closed || retrying) return;
            const msg = d.toString().trim();
            if (msg && !msg.includes('Connection reset by peer') && !msg.includes('Broken pipe')) {
                log.error('FFMPEG', msg);
            }
        });

        ffmpeg.stdout.once('data', chunk => {
            if (closed || retrying) return;
            res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/webm' });
            res.write(chunk);
            ffmpeg.stdout.pipe(res, { end: false });
        });
    };

    runAttempt(0);
}

module.exports = { pipeAudioStream };