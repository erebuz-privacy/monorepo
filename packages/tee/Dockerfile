# Erebuz TEE service (private-route API). Self-contained — no workspace deps.
# Node 22 (not 20): starknet.js requires >=22 and is now on the main import path
# via services/cctp/starknet.ts, so a Node 20 base fails at boot rather than at
# install. The STRK20 privacy SDK will need >=24 when it lands.
FROM node:22-bookworm-slim

# better-sqlite3 compiles a native binding if no prebuilt is available.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching (tsx is a runtime dep here — `tsx index.ts`).
# --legacy-peer-deps: local dev uses pnpm (lenient peers); npm is strict and
# @railgun-community/shared-models peers ethers@6.14.3 vs our pinned ethers@6.13.1.
COPY package.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "index.ts"]
