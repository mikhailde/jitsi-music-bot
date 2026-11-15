const http = require('http');
const { once } = require('events');
const config = require('../config');
const log = require('../utils/logger');
const { pipeAudioStream } = require('./pipeline');
const { updateYtDlp } = require('./sources/youtube');

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const isValidStreamUrl = (target) => {
    if (!target || /\s/.test(target)) return false;
    try {
        const u = new URL(target);
        return /^https?:$/.test(u.protocol) && YT_HOSTS.has(u.hostname.toLowerCase()) && (u.pathname !== '/' || u.search);
    } catch {
        return false;
    }
};

async function startAudioServer() {
    await updateYtDlp();

    const server = http.createServer((req, res) => {
        let u;
        try {
            u = new URL(req.url, 'http://127.0.0.1');
        } catch {
            return res.writeHead(400).end();
        }

        if (u.pathname !== '/audio-stream') return res.writeHead(404).end();
        if (req.method !== 'GET') return res.writeHead(405).end();

        const target = u.searchParams.get('url');
        if (isValidStreamUrl(target)) return pipeAudioStream(target, res);
        res.writeHead(400).end();
    });

    server.listen(config.port, '127.0.0.1');
    await once(server, 'listening');

    const updateTimer = setInterval(updateYtDlp, UPDATE_INTERVAL_MS).unref();
    server.on('close', () => clearInterval(updateTimer));

    log.info('AUDIO', `Audio server listening on port ${config.port}`);
    return server;
}

module.exports = { startAudioServer };