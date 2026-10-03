FROM node:20-slim AS base

# better-sqlite3 ships prebuilt binaries for linux-x64, but falls back to a
# source build when the platform does not match — keep the toolchain available.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# The ledger lives on a mounted volume in production so it survives redeploys.
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/modelledger.db
ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
