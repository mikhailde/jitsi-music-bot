require('dotenv').config();
const { env } = process;

const fail = (msg) => {
    console.error(`\n[CONFIG ERROR] ${msg}\n`);
    process.exit(1);
};

const requiredKeys = [
    'PORT', 'TELEGRAM_TOKEN', 'PROXY_URL', 'DEBUG_MODE', 'LANGUAGE',
    'DEFAULT_VOLUME', 'AUDIO_BITRATE', 'OPUS_BITRATE', 'HISTORY_LIMIT',
    'QUEUE_PAGE_SIZE', 'RADIO_ITEMS_LIMIT', 'MAX_PLAYLIST_ITEMS',
    'JITSI_DOMAIN', 'BOT_NAME', 'BOT_AVATAR',
    'IDLE_TIMEOUT_SEC', 'IDLE_CHECK_INTERVAL_SEC', 'CONNECT_TIMEOUT_SEC',
    'RECONNECT_TIMEOUT_SEC', 'SHUTDOWN_TIMEOUT_SEC', 'HEADLESS_MODE',
    'TELEGRAM_ADMIN_IDS'
];

const missing = requiredKeys.filter(k => env[k] === undefined);
if (missing.length) fail(`Missing required environment variables in .env:\n${missing.map(k => `  - ${k}`).join('\n')}`);

const getStr = (k) => env[k].trim();

const getNum = (k, min) => {
    const val = getStr(k);
    const n = Number(val);
    if (val === '' || isNaN(n)) fail(`Parameter ${k} must be a number! Received: "${env[k]}"`);
    return min !== undefined ? Math.max(min, n) : n;
};

const getBool = (k) => {
    const val = getStr(k).toLowerCase();
    if (val !== 'true' && val !== 'false') fail(`Parameter ${k} must be strictly 'true' or 'false'! Received: "${env[k]}"`);
    return val === 'true';
};

const telegramToken = getStr('TELEGRAM_TOKEN');
if (!telegramToken) fail('Parameter TELEGRAM_TOKEN cannot be empty!');

const config = {
    port: getNum('PORT'),
    telegramToken,
    proxy: getStr('PROXY_URL') || null,
    debugMode: getBool('DEBUG_MODE'),
    lang: getStr('LANGUAGE').toLowerCase(),

    defaultVolume: Math.min(100, getNum('DEFAULT_VOLUME', 0)) / 100,
    audioBitrate: getStr('AUDIO_BITRATE'),
    opusBitrate: getNum('OPUS_BITRATE'),
    historyLimit: getNum('HISTORY_LIMIT', 1),
    queuePageSize: getNum('QUEUE_PAGE_SIZE', 1),
    radioItemsLimit: getNum('RADIO_ITEMS_LIMIT', 1),
    maxPlaylistItems: getNum('MAX_PLAYLIST_ITEMS', 1),

    jitsiDomain: getStr('JITSI_DOMAIN'),
    botName: getStr('BOT_NAME'),
    avatarUrl: getStr('BOT_AVATAR') || null,

    idleTimeoutSec: getNum('IDLE_TIMEOUT_SEC'),
    idleCheckIntervalSec: getNum('IDLE_CHECK_INTERVAL_SEC'),
    connectTimeoutSec: getNum('CONNECT_TIMEOUT_SEC', 5),
    reconnectTimeoutSec: getNum('RECONNECT_TIMEOUT_SEC'),
    shutdownTimeoutSec: getNum('SHUTDOWN_TIMEOUT_SEC'),

    headless: getBool('HEADLESS_MODE'),
    adminIds: getStr('TELEGRAM_ADMIN_IDS').split(',').map(s => s.trim()).filter(Boolean),

    getMeetUrl(room, domain = config.jitsiDomain) {
        return `https://${domain}/${room}#${config._jitsiHash}`;
    }
};

config._jitsiHash = [
    'config.prejoinConfig.enabled=false',
    'config.startAudioOnly=true',
    'config.startWithVideoMuted=true',
    'config.startWithAudioMuted=false',
    `userInfo.displayName="${encodeURIComponent(config.botName)}"`,
    'config.audioQuality.stereo=true',
    `config.audioQuality.opusMaxAverageBitrate=${config.opusBitrate}`,
    'config.enableNoAudioDetection=false',
    'config.enableNoisyMicDetection=false',
    'config.disableAudioLevels=true',
    'config.gravatar.disabled=true',
    'config.p2p.enabled=false'
].join('&');

module.exports = config;