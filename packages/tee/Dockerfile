# Erebuz TEE service (private-route API). Self-contained — no workspace deps.
FROM node:20-bookworm-slim

# better-sqlite3 compiles a native binding if no prebuilt is available.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching (tsx is a runtime dep here — `tsx index.ts`).
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "index.ts"]
