<div align="center">

# Jitsi Music Bot

Jitsi Meet music bot with stereo audio and smart YouTube autoplay, controlled via Telegram and in-meeting chat.

[![Jitsi: Handbook](https://img.shields.io/badge/Listed_in-Jitsi_Handbook-17A2B8?logo=jitsi&logoColor=white)](https://jitsi.github.io/handbook/docs/community/third-party-software)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-v1.63-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![WebAudio](https://img.shields.io/badge/WebAudio-HD_Stereo-blueviolet)](https://www.w3.org/TR/webaudio/)
[![Telegram](https://img.shields.io/badge/Telegram-@jitsimusic__bot-2CA5E0?logo=telegram&logoColor=white)](https://t.me/jitsimusic_bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Highlights

- **HD WebAudio Pipeline**: Direct 48 kHz WebAudio injection with stereo and Opus bitrates up to 510 kbps. Disables browser/Jitsi audio processing (`disableAP`), Opus DTX, and Opus RED.
- **Telegram Remote Control**: Manage room connections, live playback status, and access control via Telegram bot powered by [GrammY](https://grammy.dev/).
- **Multi-Instance & JWT Rooms**: Seamlessly join public (`meet.jit.si`) or custom corporate/JWT-authenticated (`?jwt=...`) Jitsi instances via smart URL parsing.
- **YouTube PO Token & Auto-Update**: Built-in `bgutil-ytdlp-pot-provider` Deno sidecar and automatic nightly `yt-dlp` updates to prevent server IP `403` and bot-check failures.
- **Infinite Radio Mode**: Autoplays relevant recommendations from YouTube Music radio (`RDAMVM` with `RD` fallback) and in-memory mix caching when the queue is exhausted.
- **Real-Time Telegram Alerts**: Asynchronous push notifications in Telegram explaining why the bot left (moderator kick, idle timeout, lobby timeout, network drop, or crash).
- **Smart Moderation & Resilience**: Auto-pauses on moderator mute or when the room becomes empty (resuming automatically when participants rejoin), handles temporary network drops, and runs unprivileged (`pwuser`) with Docker `init: true`.
- **Zero-Dependency HTTP Streamer**: Native `node:http` and process-group stream pipeline without heavy web frameworks.
- **Fail-Fast Configuration**: Strict `.env` validation with zero hidden magic numbers.

---

## Architecture

```text
[ Telegram / Chat ]
        │ (Commands)
        ▼
┌──────────────────┐     Track URL      ┌──────────────┐   PO Token   ┌─────────────────┐
│  Player State    │ ─────────────────> │    yt-dlp    │ <──────────> │ bgutil-provider │
│  & Queue Manager │                    └──────┬───────┘   (:4416)    │ (Deno Sidecar)  │
└────────┬─────────┘                           │ (Raw Audio)          └─────────────────┘
         │                                     ▼
         │                              ┌──────────────┐
         │                              │    ffmpeg    │ (libopus / 48kHz stereo)
         │                              └──────┬───────┘
         │                                     │ (audio/webm)
         │                                     ▼
         │                              ┌──────────────┐
         │                              │ node:http    │ 127.0.0.1:PORT/audio-stream
         │                              │ Streamer     │
         │                              └──────┬───────┘
         │                                     │ HTTP Chunked
         ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Playwright (Headless Chromium, unprivileged pwuser)                     │
│                                                                         │
│  ┌───────────────┐     ┌────────────────────┐     ┌───────────────────┐ │
│  │ <audio> node  │ ──> │ AudioContext 48kHz │ ──> │ getUserMedia()    │ │
│  └───────────────┘     │  + GainNode        │     │ (cloned track)    │ │
│                        └────────────────────┘     └─────────┬─────────┘ │
│                                                             │           │
│                                                             ▼           │
│                                                    [ Jitsi WebRTC ]     │
└─────────────────────────────────────────────────────────────────────────┘
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
This starts both `jitsi-music-bot` and the internal `jitsi-pot-provider` PO Token sidecar container.

<details>
<summary><b>Running locally without Docker</b></summary>

Ensure you have **Node.js 20+**, **Python 3.11+** (required on Linux by `youtube-dl-exec`), **FFmpeg**, and **Deno** installed:
```bash
npm ci
npm run check  # Verify syntax of all modules
npm start
```
*(Optional: for PO Token support locally, also install the `bgutil-ytdlp-pot-provider` plugin for `yt-dlp`, run the provider server, and set `POT_PROVIDER_URL`.)*
</details>

---

## Commands Reference

### Telegram Bot
| Command | Description | Example |
| :--- | :--- | :--- |
| `/join <room_or_url>` | Connect to a room on default or custom Jitsi domain (supports `?jwt=...`) | `/join my-room` or `/join https://meet.company.com/team?jwt=...` |
| `/status` | View current meeting URL, playing/paused track, queue size, and settings | `/status` |
| `/leave` | Disconnect the bot from the call | `/leave` |

### Jitsi In-Meeting Chat
| Category | Command | Description |
| :--- | :--- | :--- |
| **Playback** | `/play <query\|URL>` | Play YouTube track/playlist immediately or add to end of queue |
| | `/playnext <query\|URL>` | Insert YouTube track/playlist to play immediately after the current one |
| | `/pause` · `/resume` | Pause / resume current audio playback |
| | `/skip` · `/replay` | Skip to next track / replay current track from start |
| | `/stop` | Stop playback and clear the entire queue |
| **Queue** | `/np` | Show currently playing track with progress bar (and pause/loop state) |
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
| | `/leave` · `/exit` | Disconnect bot from conference |

---

## Configuration (`.env`)

All required parameters must be defined in your `.env` file (empty values are permitted where marked optional; `TZ` and `POT_PROVIDER_URL` are optional overrides not required in `.env`):

| Category | Key | Description | Example |
| :--- | :--- | :--- | :--- |
| **Main** | `PORT` | Local audio streamer HTTP port (`1–65535`) | `3000` |
| | `LANGUAGE` | Interface language (`ru` or `en`) | `en` |
| | `DEBUG_MODE` | Verbose debug and benchmark logging | `false` |
| | `TZ` | Container timezone for logs (optional) | `UTC` |
| | `PROXY_URL` | Proxy URL (`socks5://` for Telegram, `yt-dlp` & `bgutil`; `http://` for `yt-dlp` & `bgutil`, optional) | `socks5://user:pass@host:port` |
| | `POT_PROVIDER_URL` | External PO Token server URL (optional, auto-set in Docker Compose) | `http://127.0.0.1:4416` |
| **Security** | `TELEGRAM_TOKEN` | Telegram bot token from @BotFather | `123456:ABC-DEF...` |
| | `TELEGRAM_ADMIN_IDS`| Comma-separated admin IDs (empty = public access) | `678094226,12345678` |
| **Jitsi** | `JITSI_DOMAIN` | Default Jitsi instance domain | `meet.jit.si` |
| | `BOT_NAME` | Display name inside the meeting | `DJ_Music_Bot` |
| | `BOT_AVATAR` | Image URL for bot's avatar (optional) | `https://example.com/avatar.png` |
| **Audio** | `DEFAULT_VOLUME` | Initial volume percentage (0–100) | `50` |
| | `AUDIO_BITRATE` | FFmpeg output stream bitrate | `192k` |
| | `OPUS_BITRATE` | Maximum Opus average bitrate in bps (`6000–510000`) | `510000` |
| | `HISTORY_LIMIT` | Track history capacity | `20` |
| | `HISTORY_PAGE_SIZE` | Tracks displayed per `/history` call | `5` |
| | `QUEUE_PAGE_SIZE` | Tracks displayed per `/queue` call | `5` |
| | `RADIO_ITEMS_LIMIT`| Depth of YouTube Mix candidate search | `10` |
| | `MAX_PLAYLIST_ITEMS`| Maximum tracks loaded from a single playlist | `50` |
| **Timeouts** | `IDLE_TIMEOUT_SEC` | Leave empty room after N seconds | `300` |
| | `CONNECT_TIMEOUT_SEC` | Total conference join & ready timeout in seconds (`>= 5`) | `30` |
| | `RECONNECT_TIMEOUT_SEC` | Wait for connection recovery before leave | `15` |
| | `SHUTDOWN_TIMEOUT_SEC`| Graceful shutdown timeout in seconds (must be `< 15` for Docker `stop_grace_period`) | `5` |
| **Browser** | `HEADLESS_MODE` | Run Playwright Chromium in headless mode | `true` |

---

## Audio Engineering Details

Standard WebRTC clients enforce aggressive signal conditioning intended for vocal clarity: Acoustic Echo Cancellation (AEC), Noise Suppression (NS), Automatic Gain Control (AGC), and Opus DTX/RED. These filters distort music, cut quiet passages, reduce dynamic range, and collapse stereo separation into mono.

This bot bypasses these constraints at the browser and Jitsi configuration level:

1. **Native Web Audio & Permissions:** An init script is injected into the Chromium context prior to Jitsi loading, while Playwright explicitly grants `local-network-access` to the Jitsi origin so `https://` rooms can stream from `127.0.0.1` without blocked local-network prompts.
2. **Virtual Audio Destination (48 kHz):**
   ```javascript
   const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
   const dest = ctx.createMediaStreamDestination();
   const gain = ctx.createGain();
   // HTMLAudioElement streams from local HTTP -> GainNode -> Destination
   ```
3. **Cloned Track Pass-Through:** `navigator.mediaDevices.getUserMedia` intercepts Jitsi's audio requests and returns cloned tracks (`dest.stream.getAudioTracks().map(t => t.clone())`) from the native stereo 48 kHz WebAudio destination, preventing `lib-jitsi-meet` track disposal from terminating the shared stream.
4. **Conference Hash Flags:** Parameters disable browser audio processing, disable Opus DTX/RED, disable incoming video streams, and force stereo transport on the WebRTC bridge:
   ```text
   #config.audioQuality.stereo=true
   &config.audioQuality.opusMaxAverageBitrate=510000
   &config.audioQuality.enableOpusDtx=false
   &config.enableOpusRed=false
   &config.disableAP=true
   &config.startLastN=0
   &config.channelLastN=0
   &config.p2p.enabled=false
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