# Railgun Private Proof-of-Innocence (PPOI) list-provider node.
# Builds packages/node from the upstream repo and runs the aggregator API.
# Pin POI_REF to a commit for reproducible builds.
FROM node:18-bookworm

ARG POI_REPO=https://github.com/Railgun-Community/private-proof-of-innocence.git
ARG POI_REF=main

WORKDIR /opt
RUN git clone --depth 1 --branch "${POI_REF}" "${POI_REPO}" poi

WORKDIR /opt/poi/packages/node
# The upstream setup installs + builds just the node package (mirrors ./start-list-provider).
RUN yarn install --frozen-lockfile || yarn install
RUN yarn build

ENV HOST=0.0.0.0
EXPOSE 8080

# Log through the repo's debug namespace so the runbook's log tips work.
ENV DEBUG=poi:*
CMD ["node", "dist/main.js"]
