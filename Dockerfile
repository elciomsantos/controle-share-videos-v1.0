# =============================================================================
# Supply chain hardening (PLANO_HARDENING_DOCKER item 7): base image pinned by
# digest instead of tag. Digest do manifest multi-arch node:24-alpine
# (linux/amd64 + linux/arm64/v8). Renovar via Renovate/Dependabot
# (config: dockerfile base image digest pins).
# =============================================================================
ARG NODE_BASE_IMAGE=node@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43

# =============================================================================
# Stage 0: Build @controle-share/shared (ARQ-03)
# The backend and frontend depend on it via `file:../packages/shared`. npm
# installs it as a relative symlink (node_modules/@controle-share/shared →
# ../../../packages/shared), so the directory layout inside the image must
# mirror the repo: /opt/app/{frontend,backend,packages}. See commit 499e2fd.
# =============================================================================
FROM ${NODE_BASE_IMAGE} AS shared-builder
WORKDIR /opt/app/packages/shared
COPY packages/shared/package.json packages/shared/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline
COPY packages/shared/tsconfig.json ./
COPY packages/shared/src ./src
RUN npm run build

# =============================================================================
# Stage 1: Frontend dependencies
# =============================================================================
FROM ${NODE_BASE_IMAGE} AS frontend-dependencies
WORKDIR /opt/app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline

# =============================================================================
# Stage 2: Build frontend (Next.js standalone)
# =============================================================================
FROM ${NODE_BASE_IMAGE} AS frontend-builder
ARG API_URL
ENV API_URL=${API_URL:-http://localhost:3000}
WORKDIR /opt/app/frontend
COPY ./frontend .
COPY --from=frontend-dependencies /opt/app/frontend/node_modules ./node_modules
# Shared package needed at build time (its dist is gitignored; built in stage 0).
COPY --from=shared-builder /opt/app/packages/shared /opt/app/packages/shared
RUN npm run build

# =============================================================================
# Stage 3: Backend dependencies
# =============================================================================
FROM ${NODE_BASE_IMAGE} AS backend-dependencies
# python3 + make + g++ are required for node-gyp (better-sqlite3, argon2 native
# addons). Installed as a virtual package so they can be purged after `npm ci`
# finishes, keeping the layer lean (P3 INFRA-LOW-01).
WORKDIR /opt/app/backend
COPY backend/package.json backend/package-lock.json ./
# prisma.config.ts + schema are required because `npm ci` runs the backend's
# postinstall `prisma generate` (fix(ci) bfef55d), which needs the schema.
COPY backend/prisma.config.ts ./
COPY backend/prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --prefer-offline \
    && apk del --no-cache --purge .build-deps \
    && npm cache clean --force

# =============================================================================
# Stage 4: Build backend
# =============================================================================
FROM ${NODE_BASE_IMAGE} AS backend-builder
RUN apk add --no-cache openssl
WORKDIR /opt/app/backend
COPY ./backend .
COPY --from=backend-dependencies /opt/app/backend/node_modules ./node_modules
# Shared package needed at build time (its dist is gitignored; built in stage 0).
COPY --from=shared-builder /opt/app/packages/shared /opt/app/packages/shared
RUN npx prisma generate
RUN npm run build && npm prune --production
# Compile seed files (fora do src/, nest build não os inclui). Com
# rootDir=., o import relativo ../../src/ do config.seed resolve em runtime
# para dist/src/ (compilado pelo nest build acima).
RUN npx tsc --ignoreConfig \
    --ignoreDeprecations "6.0" --skipLibCheck --declaration false \
    --esModuleInterop --module commonjs --moduleResolution node10 \
    --types node --outDir dist --rootDir . \
    prisma/seed/config.seed.ts prisma/seed/user.seed.ts

# =============================================================================
# Stage 5: Frontend runner (standalone Next.js)
# =============================================================================
FROM ${NODE_BASE_IMAGE} AS frontend-runner
ENV NODE_ENV=production
WORKDIR /opt/app/frontend
COPY --from=frontend-builder /opt/app/frontend/public ./public
COPY --from=frontend-builder /opt/app/frontend/.next/standalone ./
COPY --from=frontend-builder /opt/app/frontend/.next/static ./.next/static
COPY --from=frontend-builder /opt/app/frontend/public/img /tmp/img

# Remove npm/npx: not needed to run the standalone Next.js server, and the
# npm bundle ships vulnerable transitive deps (undici/tar/ip-address/...)
# that image scanners flag. Same rationale as P3 INFRA-Low-01 in the runner
# stage below.
RUN rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/bin/npm /usr/local/bin/npx /root/.npm

# =============================================================================
# Stage 6: Backend runner (NestJS)
# =============================================================================
FROM ${NODE_BASE_IMAGE} AS backend-runner
ENV NODE_ENV=production
# ffmpeg: embute o certificado (PDF/hash) como metadados inseparáveis do vídeo
RUN apk add --no-cache ffmpeg
# Non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup
WORKDIR /opt/app/backend
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/backend/node_modules ./node_modules
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/backend/dist ./dist
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/backend/prisma ./prisma
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/backend/prisma.config.ts ./
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/backend/package.json ./
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/backend/tsconfig.json ./
# Assets estáticos do backend (imagens do cabeçalho do certificado).
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/backend/assets ./assets
# Shared package at runtime (npm symlink ../../../packages/shared resolves here).
COPY --from=shared-builder --chown=appuser:appgroup /opt/app/packages/shared /opt/app/packages/shared
USER appuser

# =============================================================================
# Stage 7: Final combined image (Caddy + Backend + Frontend)
# =============================================================================
FROM ${NODE_BASE_IMAGE} AS runner
ENV NODE_ENV=docker

# Install runtime dependencies: curl (healthcheck), caddy (reverse proxy), su-exec (user switching)
# P3 INFRA-LOW-01: clear the npm cache before removing the npm binary so any
# residual cache in /root/.npm is dropped from the final image.
RUN apk update --no-cache && \
    apk upgrade --no-cache && \
    apk add --no-cache curl caddy su-exec openssl ffmpeg && \
    npm cache clean --force && \
    rm -rf /var/cache/apk/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

# Create non-root user and group
RUN addgroup -g 1002 -S controle-group && \
    adduser -u 1002 -S controle-user -G controle-group

WORKDIR /opt/app

# Copy frontend (standalone Next.js)
COPY --from=frontend-runner --chown=controle-user:controle-group /opt/app/frontend ./frontend
COPY --from=frontend-runner --chown=controle-user:controle-group /tmp/img ./frontend/public/img

# Keep a copy of the default images in the image so the entrypoint can restore
# them into the frontend-images volume (which shadows /opt/app/frontend/public/img)
COPY --from=frontend-runner --chown=controle-user:controle-group /tmp/img /tmp/img

# Copy backend
COPY --from=backend-runner --chown=controle-user:controle-group /opt/app/backend ./backend

# Copy shared package (@controle-share/shared). The backend's npm symlink
# node_modules/@controle-share/shared → ../../../packages/shared resolves to
# /opt/app/packages/shared at runtime.
COPY --from=shared-builder --chown=controle-user:controle-group /opt/app/packages/shared /opt/app/packages/shared

# Copy reverse proxy config and entrypoint scripts
COPY ./reverse-proxy /opt/app/reverse-proxy
COPY ./scripts/docker /opt/app/scripts/docker

# Data directories
RUN mkdir -p /opt/app/backend/data /opt/app/frontend/public/img && \
    chown -R controle-user:controle-group /opt/app/backend/data /opt/app/frontend/public/img

# Expose backend (NestJS) and frontend (Next.js standalone) ports.
# Caddy is disabled in production (CADDY_DISABLED=true); the external
# caddy service (caddy:2.9-alpine) handles TLS and reverse proxy.
EXPOSE 8080 3333

# Healthcheck (INFRA-HIGH-02)
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD /bin/sh -c '(if [ "$CADDY_DISABLED" = "true" ]; then curl -fs http://127.0.0.1:${BACKEND_PORT:-8080}/api/health; else curl -fs http://127.0.0.1:3000/api/health; fi) || exit 1'

# Entrypoint: create user, set permissions, start Caddy + Next.js + NestJS
ENTRYPOINT ["sh", "./scripts/docker/create-user.sh"]
CMD ["sh", "./scripts/docker/entrypoint.sh"]