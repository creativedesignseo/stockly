# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Stockly — Shopify Remix + Prisma 6 + Postgres on Fly.io
# ---------------------------------------------------------------------------
# Why Debian (bookworm-slim) and NOT Alpine:
#   Our schema.prisma sets binaryTargets = ["native", "rhel-openssl-3.0.x"].
#   That is a glibc + OpenSSL 3 engine. Alpine uses musl, which would force a
#   different binary (linux-musl-openssl-3.0.x) — runtime "Query engine
#   library for current platform could not be loaded" errors.
#
# Why Node 20:
#   package.json engines: ">=20.19 <22 || >=22.12". Node 20 is the LTS that
#   fits. (Node 18 fails engine-strict; Node 22.0-22.11 also blocked.)
#
# Build strategy: multi-stage so the runtime image carries no dev deps,
# no source, no Shopify CLI — just the built Remix server + Prisma client.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=20.19.0

# ---------- base ----------
FROM node:${NODE_VERSION}-bookworm-slim AS base

# OpenSSL + CA certs are required at runtime by the Prisma query engine
# (rhel-openssl-3.0.x binary dynamically links libssl/libcrypto) AND for
# any outbound HTTPS calls. ca-certificates also keeps Node TLS happy.
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# ---------- builder ----------
FROM base AS builder

# Build needs dev deps (vite, @remix-run/dev, typescript, prisma CLI).
ENV NODE_ENV=development

# Copy .npmrc FIRST so legacy-peer-deps and engine-strict apply to npm ci.
COPY .npmrc package.json package-lock.json ./

# postinstall runs `prisma generate`, which needs the schema present.
# Copy it before install so the install-time codegen succeeds.
COPY prisma ./prisma

# Install ALL deps (dev + prod) with the legacy-peer-deps flag honored
# via .npmrc. --include=dev is explicit belt-and-braces because NODE_ENV
# above is "development" but some npm versions still trip on it.
RUN npm ci --include=dev --legacy-peer-deps

# Now copy the rest of the source and build Remix.
COPY . .

# Re-run prisma generate explicitly so the rhel-openssl-3.0.x engine is
# generated into node_modules/.prisma/client (postinstall may have run
# before schema was final in some edge cases).
RUN npx prisma generate

# Build Remix (vite:build -> build/server + build/client).
RUN npm run build

# The Vite/Vercel preset in vite.config.ts emits the SSR bundle under a
# runtime-keyed directory (build/server/nodejs-eyJydW50aW1lIjoibm9kZWpzIn0/)
# instead of build/server/index.js. `remix-serve` (and our `npm run start`
# script) expects the canonical path. Symlink the nested index.js up to
# the canonical location so `remix-serve ./build/server/index.js` resolves.
# The hash is the base64 of {"runtime":"nodejs"} — deterministic across
# builds of this preset, but we resolve dynamically to be future-proof.
RUN set -eux; \
    nested="$(find build/server -mindepth 2 -maxdepth 2 -name index.js | head -n1)"; \
    if [ -n "$nested" ] && [ ! -f build/server/index.js ]; then \
      ln -s "$(basename "$(dirname "$nested")")/index.js" build/server/index.js; \
    fi; \
    test -e build/server/index.js

# Drop dev deps from this stage so we can copy a lean node_modules to runtime.
# We re-install prod-only deps; postinstall fires prisma generate again with
# the correct binary target.
RUN npm prune --omit=dev --legacy-peer-deps

# ---------- runtime ----------
FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Copy production node_modules (with generated Prisma client + rhel engine).
COPY --from=builder /app/node_modules ./node_modules
# Copy built Remix output.
COPY --from=builder /app/build ./build
# Copy public assets, prisma schema (needed for `prisma db push`
# in Railway's preDeployCommand, see railway.json), and the package manifests.
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json /app/package-lock.json /app/.npmrc ./

EXPOSE 3000

# Railway runs `npx prisma db push --skip-generate` via deploy.preDeployCommand
# in railway.json, so the container CMD just needs to boot the Remix server.
# (`remix-serve` is shipped by @remix-run/serve — a prod dep.)
CMD ["npm", "run", "start"]
