<div align="center">

# Jitsi Music Bot

High-performance, production-ready music bot for Jitsi Meet conferences with Telegram remote control, YouTube streaming, and smart autoplay.

[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-v1.63-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![WebAudio](https://img.shields.io/badge/WebAudio-HD_Stereo-blueviolet)](https://www.w3.org/TR/webaudio/)
[![Telegram](https://img.shields.io/badge/Telegram-@jitsimusic__bot-2CA5E0?logo=telegram&logoColor=white)](https://t.me/jitsimusic_bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Highlights

- **HD WebAudio Pipeline**: Direct WebRTC audio injection with stereo and Opus bitrates up to 510 kbps. Explicit bypass of browser AEC, AGC, and noise suppression.
- **Telegram Remote Control**: Manage room connections, status checks, and access control via Telegram bot powered by [GrammY](https://grammy.dev/).
- **Multi-Instance & Self-Hosted Jitsi**: Seamlessly join public (`meet.jit.si`) or custom corporate Jitsi instances via smart URL parsing.
- **Infinite Radio Mode**: Autoplays relevant recommendations from YouTube Mix anchored to seed tracks when the queue is exhausted.
- **Real-Time Telegram Alerts**: Asynchronous push notifications in Telegram explaining why the bot left (moderator kick, idle timeout, network drop, or crash).
- **Smart Moderation & Resilience**: Automatically pauses on moderator mute, gracefully handles kicks, reconnects on temporary network drops, and cleans up zombies via Docker `init: true`.
- **Zero-Dependency HTTP Streamer**: Native `node:http` and pipeline streams without heavy web frameworks.
- **Fail-Fast Configuration**: Strict `.env` validation with zero hidden magic numbers.

---

## Architecture

```text
[ Telegram / Chat ]
        │ (Commands)
        ▼
┌──────────────────┐       Piped Raw Stream       ┌──────────────┐
│  Player State    │ ───────────────────────────> │    yt-dlp    │
│  & Queue Manager │                              └──────┬───────┘
└────────┬─────────┘                                     │ (Raw Audio)
         │                                               ▼
         │                                        ┌──────────────┐
         │                                        │    ffmpeg    │ (libopus / stereo)
         │                                        └──────┬───────┘
         │                                               │ (audio/webm)
         │                                               ▼
         │                                        ┌──────────────┐
         │                                        │ node:http    │ :PORT/audio-stream
         │                                        │ Streamer     │
         │                                        └──────┬───────┘
         │                                               │ HTTP Chunked
         ▼                                               ▼
┌────────────────────────────────────────────────────────────────┐
│ Playwright (Headless Chromium)                                 │
│                                                                │
│  ┌───────────────┐     ┌──────────────┐     ┌────────────────┐ │
│  │ <audio> node  │ ──> │ AudioContext │ ──> │ getUserMedia() │ │
│  └───────────────┘     └──────────────┘     └───────┬────────┘ │
│                                                     │          │
│                                                     ▼          │
│                                             [ Jitsi WebRTC ]   │
└────────────────────────────────────────────────────────────────┘
```

---

## Live Demo

Test the bot live without self-hosting: **[@jitsimusic_bot](https://t.me/jitsimusic_bot)**

> [!NOTE]
> **Shared Demo Disclaimer**  
> This public instance runs on personal infrastructure and supports **one active call at a time**. It may occasionally be busy in another meeting, offline, or restricted to admin-only access.
> 
> If the demo is occupied or unavailable, please follow the **[Quick Start](#quick-start)** below to spin up your own dedicated instance in under 2 minutes.

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
nano .env # Fill in TELEGRAM_TOKEN and adjust preferences
```

### 3. Launch with Docker Compose
```bash
docker compose up -d --build
```

<details>
<summary><b>Running locally without Docker</b></summary>

Ensure you have **Node.js 20+**, **FFmpeg**, and **Deno** installed:
```bash
npm ci
npm run check  # Verify syntax of all modules
npm start
```
</details>

---

## Commands Reference

### Telegram Bot
| Command | Description | Example |
| :--- | :--- | :--- |
| `/join <room_or_url>` | Connect to a room on default or custom Jitsi domain | `/join my-room` or `/join meet.company.com/team` |
| `/status` | View current playback, track URL, queue length, and volume | `/status` |
| `/leave` | Disconnect the bot from the call | `/leave` |

> [!TIP]
> You can pass direct URLs to `/join` — the bot automatically extracts the domain and room name, allowing you to connect it to any private or self-hosted Jitsi instance on the fly.

### Jitsi In-Meeting Chat
| Category | Command | Description |
| :--- | :--- | :--- |
| **Playback** | `/play <query\|URL>` | Play track immediately or add to end of queue |
| | `/playnext <query\|URL>` | Insert track to play immediately after the current one |
| | `/pause` · `/resume` | Pause / resume current audio playback |
| | `/skip` · `/replay` | Skip to next track / replay current track from start |
| | `/stop` | Stop playback and clear the entire queue |
| **Queue** | `/np` | Show currently playing track with interactive progress bar |
| | `/queue` | Display upcoming tracks in queue |
| | `/history` | Show recently played tracks |
| | `/shuffle` | Randomize the order of tracks in queue |
| | `/move <from> <to>` | Move a track from one position to another (e.g. `/move 3 1`) |
| | `/remove <index>` | Remove a specific track from queue by its index |
| | `/clear` | Wipe all tracks from the queue |
| **Settings** | `/volume <0-100>` | Adjust playback volume (persists across tracks) |
| | `/radio` | Toggle infinite autoplay mode from YouTube Mix |
| | `/loop <track\|queue\|off>` | Set repeat mode (current track, whole queue, or disabled) |
| **Control** | `/help` | Print complete command manual in meeting chat |
| | `/leave` | Disconnect bot from conference |

---

## Configuration (`.env`)

All parameters must be defined in your `.env` file (empty values are permitted where marked optional):

| Category | Key | Description | Example |
| :--- | :--- | :--- | :--- |
| **Main** | `PORT` | Local audio streamer HTTP port | `3000` |
| | `LANGUAGE` | Interface language (`ru` or `en`) | `en` |
| | `DEBUG_MODE` | Verbose debug and benchmark logging | `false` |
| | `TZ` | Container timezone for logs (optional) | `UTC` |
| | `PROXY_URL` | SOCKS5/HTTP proxy URL (optional) | `socks5://user:pass@host:port` |
| **Security** | `TELEGRAM_TOKEN` | Telegram bot token from @BotFather | `123456:ABC-DEF...` |
| | `TELEGRAM_ADMIN_IDS`| Comma-separated admin IDs (empty = public access) | `678094226,12345678` |
| **Jitsi** | `JITSI_DOMAIN` | Default Jitsi instance domain | `meet.jit.si` |
| | `BOT_NAME` | Display name inside the meeting | `DJ_Music_Bot` |
| | `BOT_AVATAR` | Image URL for bot's avatar (optional) | `https://example.com/avatar.png` |
| **Audio** | `DEFAULT_VOLUME` | Initial volume percentage (0–100) | `50` |
| | `AUDIO_BITRATE` | FFmpeg output stream bitrate | `192k` |
| | `OPUS_BITRATE` | Maximum Opus average bitrate | `510000` |
| | `HISTORY_LIMIT` | Track history capacity | `20` |
| | `HISTORY_PAGE_SIZE` | Tracks displayed per `/history` call | `5` |
| | `QUEUE_PAGE_SIZE` | Tracks displayed per `/queue` call | `5` |
| | `RADIO_ITEMS_LIMIT`| Depth of YouTube Mix candidate search | `10` |
| | `MAX_PLAYLIST_ITEMS`| Maximum tracks loaded from a single playlist | `50` |
| **Timeouts** | `IDLE_TIMEOUT_SEC` | Leave empty room after N seconds | `300` |
| | `CONNECT_TIMEOUT_SEC` | Conference join & ready timeout in seconds | `30` |
| | `RECONNECT_TIMEOUT_SEC` | Wait for connection recovery before leave | `15` |
| | `SHUTDOWN_TIMEOUT_SEC`| Graceful shutdown timeout in seconds | `3` |
| **Browser** | `HEADLESS_MODE` | Run Playwright Chromium in headless mode | `true` |

---

## Audio Engineering Details

Standard WebRTC clients enforce aggressive signal conditioning intended for vocal clarity: Acoustic Echo Cancellation (AEC), Noise Suppression (NS), and Automatic Gain Control (AGC). These filters distort music, reduce dynamic range, and collapse stereo separation into mono.

This bot bypasses these constraints at the browser level:

1. **Native Web Audio Interception:** An init script is injected into the Chromium context prior to Jitsi loading.
2. **Virtual Audio Destination:**
   ```javascript
   const ctx = new AudioContext();
   const dest = ctx.createMediaStreamDestination();
   const gain = ctx.createGain();
   // HTMLAudioElement streams from local HTTP -> GainNode -> Destination
   ```
3. **Constraint Overriding:** `navigator.mediaDevices.getUserMedia` intercepts Jitsi's audio requests and enforces pure studio pass-through:
   - `echoCancellation: false`
   - `noiseSuppression: false`
   - `autoGainControl: false`
   - `channelCount: 2` (Stereo)
4. **Conference Hash Flags:** Parameters force stereo transport and high bitrates on the WebRTC bridge:
   ```text
   #config.audioQuality.stereo=true
   &config.audioQuality.opusMaxAverageBitrate=510000
   &config.startAudioOnly=true
   &config.disableAudioLevels=true
   ```

---

## Project Structure

```text
src/
├── audio/                # Audio subsystem
│   ├── sources/          # Track resolution providers (YouTube/yt-dlp)
│   ├── pipeline.js       # Low-level FFmpeg & yt-dlp streaming pipeline
│   ├── server.js         # Native node:http audio streaming server
│   └── index.js          # Audio subsystem facade
├── config/               # Strict environment validator & precompiled i18n
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
│   │   ├── watchdog.js   # Server-side IDLE room watchdog
│   │   └── index.js      # Jitsi session manager & API facade
│   ├── telegram/         # Telegram remote control bot (GrammY)
│   └── index.js          # Unified platforms facade
├── utils/                # Zero-dependency utilities (logger, formatters)
└── index.js              # Application bootstrap & graceful shutdown coordinator
```

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.