const http = require('http');
const { once } = require('events');
const config = require('../config');
const log = require('../utils/logger');
const { pipeAudioStream } = require('./pipeline');
const { updateYtDlp } = require('./sources/youtube');

async function startAudioServer() {
    await updateYtDlp();

    const server = http.createServer((req, res) => {
        try {
            const u = new URL(req.url, 'http://127.0.0.1');
            const target = req.method === 'GET' && u.pathname === '/audio-stream' && u.searchParams.get('url');

            if (target && /^https?:\/\//i.test(target)) {
                return pipeAudioStream(target, res, req);
            }
            res.writeHead(u.pathname === '/audio-stream' ? 400 : 404).end();
        } catch {
            res.writeHead(400).end();
        }
    });

    server.listen(config.port, '127.0.0.1');
    await once(server, 'listening');
    log.info('AUDIO', `Audio server listening on port ${config.port}`);

    return server;
}

module.exports = { startAudioServer };