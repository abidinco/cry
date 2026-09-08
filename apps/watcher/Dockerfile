# İzleme servisi — Hetzner. Bağımlılık YOK; imaj bilerek küçük.
FROM node:24-alpine
WORKDIR /app
COPY apps/watcher/package.json ./package.json
COPY apps/watcher/src ./src
ENV NODE_ENV=production
ENV WATCHER_DB_PATH=/data/watcher.sqlite
VOLUME ["/data"]
CMD ["node", "--experimental-sqlite", "src/index.js"]
