require('dotenv').config();
const { env } = process;

const requiredKeys = [
    'PORT',
    'TELEGRAM_TOKEN',
    'PROXY_URL',
    'DEBUG_MODE',
    'LANGUAGE',
    'DEFAULT_VOLUME',
    'AUDIO_BITRATE',
    'OPUS_BITRATE',
    'HISTORY_LIMIT',
    'QUEUE_PAGE_SIZE',
    'RADIO_ITEMS_LIMIT',
    'MAX_PLAYLIST_ITEMS',
    'JITSI_DOMAIN',
    'BOT_NAME',
    'BOT_AVATAR',
    'AUDIO_ONLY',
    'P2P_ENABLED',
    'PREJOIN_ENABLED',
    'AFK_TIMEOUT_SEC',
    'AFK_CHECK_INTERVAL_SEC',
    'SHUTDOWN_TIMEOUT_SEC',
    'HEADLESS_MODE',
    'TELEGRAM_ADMIN_IDS'
];

const missing = requiredKeys.filter(k => env[k] === undefined);
if (missing.length > 0) {
    console.error(`\n[CONFIG ERROR] Missing required environment variables in .env:\n${missing.map(k => `  - ${k}`).join('\n')}\n`);
    process.exit(1);
}

const getNum = (key) => {
    const val = env[key].trim();
    const n = Number(val);
    if (val === '' || isNaN(n)) {
        console.error(`\n[CONFIG ERROR] Parameter ${key} must be a number! Received: "${env[key]}"\n`);
        process.exit(1);
    }
    return n;
};

const getBool = (key) => {
    const val = env[key].trim().toLowerCase();
    if (val !== 'true' && val !== 'false') {
        console.error(`\n[CONFIG ERROR] Parameter ${key} must be strictly 'true' or 'false'! Received: "${env[key]}"\n`);
        process.exit(1);
    }
    return val === 'true';
};

const getStr = (key) => env[key].trim();

const telegramToken = getStr('TELEGRAM_TOKEN');
if (!telegramToken) {
    console.error(`\n[CONFIG ERROR] Parameter TELEGRAM_TOKEN cannot be empty!\n`);
    process.exit(1);
}

module.exports = {
    port: getNum('PORT'),
    telegramToken,
    proxy: getStr('PROXY_URL') || null,
    debugMode: getBool('DEBUG_MODE'),
    lang: getStr('LANGUAGE').toLowerCase(),

    defaultVolume: Math.min(100, Math.max(0, getNum('DEFAULT_VOLUME'))) / 100,
    audioBitrate: getStr('AUDIO_BITRATE'),
    opusBitrate: getNum('OPUS_BITRATE'),
    historyLimit: Math.max(1, getNum('HISTORY_LIMIT')),
    queuePageSize: Math.max(1, getNum('QUEUE_PAGE_SIZE')),
    radioItemsLimit: Math.max(1, getNum('RADIO_ITEMS_LIMIT')),
    maxPlaylistItems: Math.max(1, getNum('MAX_PLAYLIST_ITEMS')),

    jitsiDomain: getStr('JITSI_DOMAIN'),
    botName: getStr('BOT_NAME'),
    avatarUrl: getStr('BOT_AVATAR') || null,
    audioOnly: getBool('AUDIO_ONLY'),
    p2pEnabled: getBool('P2P_ENABLED'),
    prejoinEnabled: getBool('PREJOIN_ENABLED'),

    afkTimeoutSec: getNum('AFK_TIMEOUT_SEC'),
    afkCheckIntervalSec: getNum('AFK_CHECK_INTERVAL_SEC'),
    shutdownTimeoutSec: getNum('SHUTDOWN_TIMEOUT_SEC'),

    headless: getBool('HEADLESS_MODE'),
    adminIds: getStr('TELEGRAM_ADMIN_IDS').split(',').map(s => s.trim()).filter(Boolean),

    getMeetUrl(room) {
        const p = [
            `config.prejoinConfig.enabled=${this.prejoinEnabled}`,
            `config.startAudioOnly=${this.audioOnly}`,
            'config.startWithVideoMuted=true',
            'config.startWithAudioMuted=false',
            `userInfo.displayName="${encodeURIComponent(this.botName)}"`,
            'config.audioQuality.stereo=true',
            `config.audioQuality.opusMaxAverageBitrate=${this.opusBitrate}`,
            'config.enableNoAudioDetection=false',
            'config.enableNoisyMicDetection=false',
            'config.disableAudioLevels=true',
            'config.gravatar.disabled=true',
            `config.p2p.enabled=${this.p2pEnabled}`
        ].join('&');
        return `https://${this.jitsiDomain}/${room}#${p}`;
    }
};