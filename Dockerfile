# Runs the app the same way `npm run dev` does locally (ts-node +
# tsconfig-paths, no separate build step) since the codebase mixes relative
# imports with "src/..." baseUrl-style imports (see tsconfig.json's `paths`)
# that plain `tsc` output wouldn't resolve at runtime without also shipping
# a module-alias step. ts-node picks up tsconfig.json's `ts-node.require:
# ["tsconfig-paths/register"]` automatically, so no extra flags are needed
# here beyond what package.json's "dev" script already does.
#
# Debian-slim (not alpine) on purpose: bcrypt is a native addon built via
# node-gyp, and the multi-stage split keeps the resulting build toolchain
# out of the final image.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# python3/make/g++ are only needed to compile bcrypt's native binding.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

# No curl/wget in this base image — hit /health with plain Node instead.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
