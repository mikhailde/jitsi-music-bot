FROM mcr.microsoft.com/playwright:v1.63.0
WORKDIR /app
ENV NODE_ENV=production DENO_INSTALL=/usr/local

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && mkdir -p /etc/yt-dlp/plugins \
    && curl -fsSL -o /etc/yt-dlp/plugins/bgutil-ytdlp-pot-provider.zip \
        https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/latest/download/bgutil-ytdlp-pot-provider.zip \
    && apt-get purge -y --auto-remove unzip \
    && rm -rf /var/lib/apt/lists/* /tmp/*

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && mkdir -p /home/pwuser/.cache /home/pwuser/.config \
    && chown -R pwuser:pwuser /home/pwuser /app/node_modules/youtube-dl-exec/bin \
    && rm -rf /root/.npm

COPY . .

USER pwuser

CMD ["node", "src/index.js"]