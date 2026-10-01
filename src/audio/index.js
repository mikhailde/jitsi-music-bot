const { startAudioServer } = require('./server');
const { getTrackInfo } = require('./sources/youtube');

module.exports = {
    startAudioServer,
    getTrackInfo
};
