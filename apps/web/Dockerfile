# Next.js — depo kökünden derlenir (workspace paketleri gerekiyor).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/chain/package.json packages/chain/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspaces --include-workspace-root || npm install --omit=dev

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install --no-audit --no-fund \
 && npx prisma generate --schema packages/db/prisma/schema.prisma \
 && npm run build --workspace @cry/web

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# standalone çıktı: node_modules'ün tamamı taşınmaz
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
