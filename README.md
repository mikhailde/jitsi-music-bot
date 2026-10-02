<div align="center">

# Jitsi Music Bot

High-performance, production-ready music bot for Jitsi Meet conferences with Telegram remote control and YouTube streaming.

[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-v1.63-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![WebAudio](https://img.shields.io/badge/WebAudio-HD_Stereo-blueviolet)](https://www.w3.org/TR/webaudio/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Highlights

- **HD WebAudio Pipeline**: Direct WebRTC audio spoofing with stereo and Opus bitrates up to 510 kbps. Automatic echo cancellation and noise suppression bypass.
- **Telegram Remote Control**: Manage room connections, status checks, and access control via Telegram bot powered by [GrammY](https://grammy.dev/).
- **Zero-Dependency HTTP Streamer**: Uses native `node:http` and pipeline streams without heavy web frameworks.
- **Infinite Radio Mode**: Autoplays relevant recommendations from YouTube Mix when the queue is exhausted.
- **Fail-Fast Configuration**: Strict `.env` validation with zero hidden magic numbers.
- **Leak-Free Engine**: Persistent audio hardware nodes (`Audio` + `GainNode`) prevent Chrome media pipeline exhaustion.
- **Silent & Clean Disconnect**: Graceful conference hangup on container restarts without phantom participants or chat spam.

---

## Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/mikhailde/jitsi-music-bot.git
cd jitsi-music-bot
```

### 2. Configure environment
```bash
cp .env.example .env
nano .env # Fill in TELEGRAM_TOKEN and other settings
```

### 3. Launch with Docker Compose
```bash
docker compose up -d --build
```

---

## Commands Reference

### Telegram Bot
| Command | Description |
| :--- | :--- |
| `/join <room_url_or_name>` | Join specified Jitsi room |
| `/status` | View current playback, queue length, and volume |
| `/leave` | Disconnect the bot from the call |

### Jitsi In-Meeting Chat
| Category | Commands |
| :--- | :--- |
| **Playback** | `/play <query>` · `/playnext <query>` · `/pause` · `/resume` · `/skip` · `/replay` · `/stop` |
| **Queue** | `/np` (progress bar) · `/queue` · `/history` · `/shuffle` · `/move <from> <to>` · `/remove <id>` · `/clear` |
| **Settings** | `/volume <0-100>` · `/radio` (toggle autoplay) · `/loop <track\|queue\|off>` |
| **Control** | `/help` · `/leave` |

---

## Configuration (`.env`)

All parameters are **mandatory** (strict fail-fast validation):

| Category | Key | Description | Example |
| :--- | :--- | :--- | :--- |
| **Main** | `PORT` | Local audio streamer port | `3000` |
| | `LANGUAGE` | Interface language (`ru` or `en`) | `en` |
| | `DEBUG_MODE` | Verbose debug and benchmark logging | `false` |
| | `TZ` | Container timezone for logs (optional) | `UTC` |
| | `PROXY_URL` | SOCKS5/HTTP proxy URL (optional) | `socks5://user:pass@host:port` |
| **Security** | `TELEGRAM_TOKEN` | Telegram bot token from @BotFather | `123456:ABC-DEF...` |
| | `TELEGRAM_ADMIN_IDS`| Comma-separated admin IDs (empty = public) | `678094226,12345678` |
| **Jitsi** | `JITSI_DOMAIN` | Target Jitsi instance domain | `meet.jit.si` |
| | `BOT_NAME` | Display name inside the meeting | `DJ_Music_Bot` |
| | `BOT_AVATAR` | Image URL for bot's avatar | `https://example.com/avatar.png` |
| | `AUDIO_ONLY` | Block incoming participant video (cuts CPU) | `true` |
| | `P2P_ENABLED` | Force JVB media bridge routing | `false` |
| **Audio** | `DEFAULT_VOLUME` | Initial volume percentage (0–100) | `50` |
| | `AUDIO_BITRATE` | FFmpeg output stream bitrate | `192k` |
| | `OPUS_BITRATE` | Maximum Opus average bitrate | `510000` |
| | `HISTORY_LIMIT` | Track history capacity | `5` |
| | `QUEUE_PAGE_SIZE` | Tracks displayed per `/queue` call | `5` |
| | `RADIO_ITEMS_LIMIT`| Depth of YouTube Mix candidate search | `10` |
| | `MAX_PLAYLIST_ITEMS`| Maximum tracks loaded from a single playlist | `50` |
| **Timeouts** | `AFK_TIMEOUT_SEC` | Leave empty room after N seconds | `300` |
| | `AFK_CHECK_INTERVAL_SEC` | Room participant poll interval in seconds | `15` |
| | `CONNECT_TIMEOUT_SEC` | Conference join & ready timeout in seconds | `30` |
| | `RECONNECT_TIMEOUT_SEC` | Wait for connection recovery before leave | `15` |
| | `SHUTDOWN_TIMEOUT_SEC`| Graceful shutdown timeout in seconds | `3` |
| **Browser** | `HEADLESS_MODE` | Run Playwright Chromium in headless mode | `true` |

---

## Architecture Overview

```text
src/
├── audio/                # Audio subsystem
│   ├── sources/          # Track resolution providers (YouTube/yt-dlp)
│   ├── pipeline.js       # Low-level FFmpeg & yt-dlp streaming pipeline
│   ├── server.js         # Native node:http audio streaming server
│   └── index.js          # Audio subsystem facade
├── config/               # Strict environment validator & i18n dictionary
├── core/                 # Platform-agnostic domain logic
│   ├── player/           # State machine, queue, history & volume
│   ├── radio/            # Smart YouTube Mix autoplay recommendations
│   └── index.js          # Core domain facade
├── platforms/            # Platform adapters & client integrations
│   ├── jitsi/            # Jitsi Meet client integration
│   │   ├── browser.js    # Chromium lifecycle & WebAudio stream destination injection
│   │   ├── bridge.js     # Persistent HTML5 Audio & GainNode DOM bridge
│   │   ├── commands.js   # Fast O(1) in-meeting chat command dispatcher
│   │   ├── session.js    # Isolated conference session instance
│   │   ├── watchdog.js   # Server-side AFK room watchdog
│   │   └── index.js      # Jitsi session manager & API facade
│   ├── telegram/         # Telegram remote control bot (GrammY)
│   └── index.js          # Unified platforms facade
├── utils/                # Zero-dependency utilities (logger, formatters)
└── index.js              # Application bootstrap & graceful shutdown coordinator
```

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.