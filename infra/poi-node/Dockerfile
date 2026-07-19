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
# The pinned SDK (shared-models 7.3.0) only defines a POI config for Ethereum +
# testnets. Bump to 7.4.3, which adds Arbitrum (+ Polygon) POI while keeping the
# proof-query API this node's code uses (removed in 7.6). wallet 10.2.2 pins
# shared-models 7.4.3, so the whole tree dedupes to one version.
ARG SHARED_MODELS_VERSION=7.4.3
ARG WALLET_VERSION=10.2.2
RUN sed -i \
      -e "s#\"@railgun-community/shared-models\": *\"[^\"]*\"#\"@railgun-community/shared-models\": \"${SHARED_MODELS_VERSION}\"#" \
      -e "s#\"@railgun-community/wallet\": *\"[^\"]*\"#\"@railgun-community/wallet\": \"${WALLET_VERSION}\"#" \
      package.json

# The upstream Ethereum/Polygon/Arbitrum fallback RPCs use rpc.ankr.com, which now
# requires an API key and fails the SDK's provider probe on boot (the node loads
# every POI network and crashes if one is unreachable). Swap the stale ankr
# endpoints for keyless public nodes so it starts out of the box. For production,
# replace these with your own RPC endpoints.
RUN sed -i \
      -e "s#https://rpc.ankr.com/eth'#https://ethereum-rpc.publicnode.com'#g" \
      -e "s#https://rpc.ankr.com/polygon'#https://polygon-bor-rpc.publicnode.com'#g" \
      -e "s#https://rpc.ankr.com/arbitrum'#https://arbitrum-one-rpc.publicnode.com'#g" \
      src/config/fallback-providers/*.ts

# Versions changed above, so resolve fresh (no frozen lockfile), then build.
RUN yarn install && yarn build && yarn cache clean

# Run as the unprivileged built-in `node` user, not root.
RUN chown -R node:node /opt/poi
USER node

ENV HOST=0.0.0.0
ENV DEBUG=poi:*
EXPOSE 8080

CMD ["node", "dist/main.js"]
