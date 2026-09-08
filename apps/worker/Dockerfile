# Worker — tsx ile doğrudan TypeScript çalıştırır; ayrı derleme adımı yok.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/chain/package.json packages/chain/
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
RUN npm install --no-audit --no-fund
COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
CMD ["npm", "run", "start", "--workspace", "@cry/worker"]
