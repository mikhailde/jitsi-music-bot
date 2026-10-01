const jitsi = require('./jitsi');
const telegram = require('./telegram');

module.exports = {
    ...jitsi,
    ...telegram
};