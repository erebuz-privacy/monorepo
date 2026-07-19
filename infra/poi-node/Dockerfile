# Railgun Private Proof-of-Innocence (PPOI) list-provider node.
# Builds packages/node from a PINNED upstream commit and runs the aggregator API.
FROM node:18.20-bookworm

# Pinned by default for a reproducible, supply-chain-safe build. Override via
# build args only if you deliberately want a different revision.
ARG POI_REPO=https://github.com/Railgun-Community/private-proof-of-innocence.git
ARG POI_REF=4b1eaf6ef19099dbfd6b43b1ca78d2ce0132a752

WORKDIR /opt
# Full clone so we can check out an exact commit (not a moving branch).
RUN git clone "${POI_REPO}" poi && git -C poi checkout --quiet "${POI_REF}"

WORKDIR /opt/poi/packages/node
# Reproducible install against the committed lockfile, then build.
RUN yarn install --frozen-lockfile && yarn build && yarn cache clean

# Run as the unprivileged built-in `node` user, not root.
RUN chown -R node:node /opt/poi
USER node

ENV HOST=0.0.0.0
ENV DEBUG=poi:*
EXPOSE 8080

CMD ["node", "dist/main.js"]
