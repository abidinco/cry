# Blok indeksi canlı uç okuyucusu (B4) — worker imajıyla aynı düzen: tsx ile doğrudan TypeScript.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/chain/package.json packages/chain/
COPY packages/db/package.json packages/db/
COPY packages/blok-indeks/package.json packages/blok-indeks/
COPY packages/kuyruk/package.json packages/kuyruk/
COPY apps/blok-okuyucu/package.json apps/blok-okuyucu/
RUN npm install --no-audit --no-fund
COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
# `npm run` DEĞİL, doğrudan node: docker stop'un SIGTERM'i araya süreç girmeden okuyucuya ulaşmalı —
# eldeki bloklar yazılıp kursör kaydedilerek kapanıyor (canli.ts).
CMD ["node", "--import", "tsx", "apps/blok-okuyucu/src/canli.ts", "--uygula"]
