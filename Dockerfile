# syntax=docker/dockerfile:1

# One image, four roles (api · worker · dashboard · migrate). The role is chosen
# at run time by ROLE — see infra/docker-entrypoint.sh. Building all three apps
# into a single image is deliberate: turbo builds the shared packages once, and
# three images would triple build time for the same bytes.
#
# Debian slim, not Alpine (the reference project this is ported from uses
# Alpine): `argon2` and `sharp` are native and publish glibc prebuilds. On musl
# they would be compiled from source, which is slow and breaks the pnpm
# `allowBuilds` policy in pnpm-workspace.yaml that assumes prebuilt binaries.

# ── build ─────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Toolchain for any native dependency that lacks a prebuild for this platform.
# Build stage only — none of this reaches the runner.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# No git hooks in a container: the `prepare` script runs husky, and there is no
# .git here for it to install into.
ENV HUSKY=0 \
    CI=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1

RUN corepack enable

# Manifests first, so `pnpm install` stays cached until dependencies actually
# change. Every workspace package.json must be present or pnpm resolves the
# workspace incompletely.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .nvmrc ./
COPY apps/api/package.json          apps/api/
COPY apps/worker/package.json       apps/worker/
COPY apps/dashboard/package.json    apps/dashboard/
COPY packages/config/package.json   packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json       packages/db/
COPY packages/logger/package.json   packages/logger/

RUN pnpm install --frozen-lockfile

COPY . .

# turbo builds packages/* before apps/* (see turbo.json `dependsOn: ^build`),
# which is what generates the Prisma client into packages/db/src/generated.
#
# No DATABASE_URL is needed here: `prisma generate` never connects, and
# packages/db/prisma.config.ts already tolerates an undefined DIRECT_URL for
# commands that don't.
RUN pnpm build

# ── runner ────────────────────────────────────────────────────────────────────
# The whole /app tree is carried over, node_modules included. Two reasons:
#   • pnpm's node_modules is a symlink farm into .pnpm — copying it piecemeal
#     produces dangling links.
#   • `prisma migrate deploy` and the `tsx` seed are devDependencies, so a
#     production-only prune would break the migrate role.
# What this stage buys is dropping the apt lists, the pnpm store and the
# compiler toolchain from the final image.
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1

# Prisma's schema engine probes for libssl and warns loudly (then guesses
# openssl-1.1.x) when it is absent — the `migrate` role runs here, so install it
# rather than let every migration log a false alarm.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY --from=build /app /app
COPY infra/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# api listens on 4000, dashboard on 3000; neither is published to the host —
# Caddy reaches them over the compose network (infra/docker-compose.prod.yml).
EXPOSE 3000 4000

ENV ROLE=api
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
