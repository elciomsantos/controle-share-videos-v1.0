# =============================================================================
# Stage 1: Frontend dependencies
# =============================================================================
FROM node:24-alpine AS frontend-dependencies
WORKDIR /opt/app
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline

# =============================================================================
# Stage 2: Build frontend (Next.js standalone)
# =============================================================================
FROM node:24-alpine AS frontend-builder
WORKDIR /opt/app
COPY ./frontend .
COPY --from=frontend-dependencies /opt/app/node_modules ./node_modules
RUN npm run build

# =============================================================================
# Stage 3: Backend dependencies
# =============================================================================
FROM node:24-alpine AS backend-dependencies
RUN apk add --no-cache python3
WORKDIR /opt/app
COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline

# =============================================================================
# Stage 4: Build backend
# =============================================================================
FROM node:24-alpine AS backend-builder
RUN apk add --no-cache openssl
WORKDIR /opt/app
COPY ./backend .
COPY --from=backend-dependencies /opt/app/node_modules ./node_modules
RUN npx prisma generate
RUN npm run build && npm prune --production

# =============================================================================
# Stage 5: Frontend runner (standalone Next.js)
# =============================================================================
FROM node:24-alpine AS frontend-runner
ENV NODE_ENV=production
WORKDIR /opt/app/frontend
COPY --from=frontend-builder /opt/app/public ./public
COPY --from=frontend-builder /opt/app/.next/standalone ./
COPY --from=frontend-builder /opt/app/.next/static ./.next/static
COPY --from=frontend-builder /opt/app/public/img /tmp/img

# =============================================================================
# Stage 6: Backend runner (NestJS)
# =============================================================================
FROM node:24-alpine AS backend-runner
ENV NODE_ENV=production
# Non-root user
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup
WORKDIR /opt/app/backend
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/node_modules ./node_modules
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/dist ./dist
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/prisma ./prisma
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/prisma.config.ts ./
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/package.json ./
COPY --from=backend-builder --chown=appuser:appgroup /opt/app/tsconfig.json ./
USER appuser

# =============================================================================
# Stage 7: Final combined image (Caddy + Backend + Frontend)
# =============================================================================
FROM node:24-alpine AS runner
ENV NODE_ENV=docker

# Install runtime dependencies: curl (healthcheck), caddy (reverse proxy), su-exec (user switching)
RUN apk update --no-cache && \
    apk upgrade --no-cache && \
    apk add --no-cache curl caddy su-exec openssl && \
    rm -rf /var/cache/apk/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Create non-root user and group
RUN addgroup -g 1000 -S controle-group && \
    adduser -u 1000 -S controle-user -G controle-group

WORKDIR /opt/app

# Copy frontend (standalone Next.js)
COPY --from=frontend-runner --chown=controle-user:controle-group /opt/app/frontend ./frontend
COPY --from=frontend-runner --chown=controle-user:controle-group /tmp/img ./frontend/public/img

# Copy backend
COPY --from=backend-runner --chown=controle-user:controle-group /opt/app/backend ./backend

# Copy reverse proxy config and entrypoint scripts
COPY ./reverse-proxy /opt/app/reverse-proxy
COPY ./scripts/docker /opt/app/scripts/docker

# Data directories
RUN mkdir -p /opt/app/backend/data /opt/app/frontend/public/img && \
    chown -R controle-user:controle-group /opt/app/backend/data /opt/app/frontend/public/img

# Expose Caddy port
EXPOSE 3000

# Healthcheck (INFRA-HIGH-02)
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD /bin/sh -c '(if [ "$CADDY_DISABLED" = "true" ]; then curl -fs http://127.0.0.1:${BACKEND_PORT:-8080}/api/health; else curl -fs http://127.0.0.1:3000/api/health; fi) || exit 1'

# Entrypoint: create user, set permissions, start Caddy + Next.js + NestJS
ENTRYPOINT ["sh", "./scripts/docker/create-user.sh"]
CMD ["sh", "./scripts/docker/entrypoint.sh"]