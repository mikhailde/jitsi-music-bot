const http = require('http');
const config = require('../config');
const log = require('../utils/logger');
const { pipeAudioStream } = require('./pipeline');
const { updateYtDlp } = require('./sources/youtube');

function startAudioServer() {
    return new Promise(async (resolve) => {
        await updateYtDlp();
        const server = http.createServer((req, res) => {
            const u = new URL(req.url, 'http://127.0.0.1');
            const target = req.method === 'GET' && u.pathname === '/audio-stream' && u.searchParams.get('url');
            if (target) {
                pipeAudioStream(target, res, req);
            } else {
                res.writeHead(u.pathname === '/audio-stream' ? 400 : 404).end();
            }
        });

        server.listen(config.port, '127.0.0.1', () => {
            log.info('AUDIO', `Audio server listening on port ${config.port}`);
            resolve(server);
        });
    });
}

module.exports = { startAudioServer };
