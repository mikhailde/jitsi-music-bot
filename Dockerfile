FROM mcr.microsoft.com/playwright:v1.63.0
WORKDIR /app
ENV NODE_ENV=production DENO_INSTALL=/usr/local

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && apt-get purge -y unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
EXPOSE 3000

CMD ["node", "src/index.js"]
