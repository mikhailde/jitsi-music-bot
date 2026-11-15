require('dotenv').config({ quiet: true });
const { env } = process;

const fail = (msg) => {
    console.error(`\n[CONFIG ERROR] ${msg}\n`);
    process.exit(1);
};

const requiredKeys = [
    'PORT', 'TELEGRAM_TOKEN', 'PROXY_URL', 'DEBUG_MODE', 'LANGUAGE',
    'DEFAULT_VOLUME', 'AUDIO_BITRATE', 'OPUS_BITRATE', 'HISTORY_LIMIT',
    'HISTORY_PAGE_SIZE', 'QUEUE_PAGE_SIZE', 'RADIO_ITEMS_LIMIT', 'MAX_PLAYLIST_ITEMS',
    'JITSI_DOMAIN', 'BOT_NAME', 'BOT_AVATAR',
    'IDLE_TIMEOUT_SEC', 'CONNECT_TIMEOUT_SEC',
    'RECONNECT_TIMEOUT_SEC', 'SHUTDOWN_TIMEOUT_SEC', 'HEADLESS_MODE',
    'TELEGRAM_ADMIN_IDS'
];

const missing = requiredKeys.filter(k => env[k] === undefined);
if (missing.length) fail(`Missing required environment variables in .env:\n${missing.map(k => `  - ${k}`).join('\n')}`);

const getStr = (k, nonEmpty = false) => {
    const val = env[k].trim();
    if (nonEmpty && !val) fail(`Parameter ${k} cannot be empty!`);
    return val;
};

const getNum = (k, min) => {
    const val = getStr(k);
    const n = Number(val);
    if (!val || !Number.isFinite(n)) fail(`Parameter ${k} must be a number! Received: "${env[k]}"`);
    return min !== undefined ? Math.max(min, n) : n;
};

const getBool = (k) => {
    const val = getStr(k).toLowerCase();
    if (val !== 'true' && val !== 'false') fail(`Parameter ${k} must be strictly 'true' or 'false'! Received: "${env[k]}"`);
    return val === 'true';
};

const port = getNum('PORT');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`Parameter PORT must be an integer between 1 and 65535! Received: "${env.PORT}"`);
}

const opusBitrate = getNum('OPUS_BITRATE');
if (!Number.isInteger(opusBitrate) || opusBitrate < 6000 || opusBitrate > 510000) {
    fail(`Parameter OPUS_BITRATE must be an integer between 6000 and 510000! Received: "${env.OPUS_BITRATE}"`);
}

const jitsiDomain = getStr('JITSI_DOMAIN').replace(/^https?:\/\//i, '').split('/')[0];
if (!jitsiDomain) fail('Parameter JITSI_DOMAIN cannot be empty!');

let jitsiHash;

const config = {
    port,
    telegramToken: getStr('TELEGRAM_TOKEN', true),
    proxy: getStr('PROXY_URL') || null,
    potProviderUrl: env.POT_PROVIDER_URL?.trim() || null,
    debugMode: getBool('DEBUG_MODE'),
    lang: getStr('LANGUAGE', true).toLowerCase(),

    defaultVolume: Math.min(100, getNum('DEFAULT_VOLUME', 0)) / 100,
    audioBitrate: getStr('AUDIO_BITRATE', true),
    opusBitrate,
    historyLimit: getNum('HISTORY_LIMIT', 1),
    historyPageSize: getNum('HISTORY_PAGE_SIZE', 1),
    queuePageSize: getNum('QUEUE_PAGE_SIZE', 1),
    radioItemsLimit: getNum('RADIO_ITEMS_LIMIT', 1),
    maxPlaylistItems: getNum('MAX_PLAYLIST_ITEMS', 1),

    jitsiDomain,
    botName: getStr('BOT_NAME', true),
    avatarUrl: getStr('BOT_AVATAR') || null,

    idleTimeoutSec: getNum('IDLE_TIMEOUT_SEC', 1),
    connectTimeoutSec: getNum('CONNECT_TIMEOUT_SEC', 5),
    reconnectTimeoutSec: getNum('RECONNECT_TIMEOUT_SEC', 1),
    shutdownTimeoutSec: getNum('SHUTDOWN_TIMEOUT_SEC', 1),

    headless: getBool('HEADLESS_MODE'),
    adminIds: getStr('TELEGRAM_ADMIN_IDS').split(',').map(s => s.trim()).filter(Boolean),

    getMeetUrl(room, domain = config.jitsiDomain, search = '') {
        const qs = !search || search.startsWith('?') ? search : `?${search}`;
        return `https://${domain}/${encodeURIComponent(room)}${qs}#${jitsiHash}`;
    }
};

jitsiHash = [
    'config.prejoinConfig.enabled=false',
    'config.startWithVideoMuted=true',
    'config.startWithAudioMuted=false',
    'config.startLastN=0',
    'config.channelLastN=0',
    `userInfo.displayName=${encodeURIComponent(JSON.stringify(config.botName))}`,
    'config.audioQuality.stereo=true',
    `config.audioQuality.opusMaxAverageBitrate=${config.opusBitrate}`,
    'config.audioQuality.enableOpusDtx=false',
    'config.enableOpusRed=false',
    'config.disableAP=true',
    'config.enableNoisyMicDetection=false',
    'config.disableAudioLevels=true',
    'config.disableIncomingMessageSound=true',
    'config.disableJoinLeaveSounds=true',
    'config.disableBeforeUnloadHandlers=true',
    'config.analytics.disabled=true',
    'config.gravatar.disabled=true',
    'config.p2p.enabled=false',
    ...(config.avatarUrl ? [] : ['config.disableThirdPartyRequests=true'])
].join('&');

module.exports = config;