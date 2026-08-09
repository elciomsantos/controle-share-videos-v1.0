#!/bin/sh

# Copy default images (including the images/ subdir) to the frontend public
# folder if they don't already exist — self-heals the images volume on fresh
# deploys.
#
# NOTE: do NOT use `cp -rn` (no-clobber). On Alpine's busybox `cp`, when the
# destination already exists as an empty directory (e.g. a freshly bind-mounted
# volume), `-n` short-circuits and copies NOTHING, even if the directory is
# empty — leaving the public/img folder empty and causing 404s for every asset
# (and bad-precaching-response failures in the service worker). Using `-a`
# (archive mode) reliably copies the contents into the mounted directory.
cp -a /tmp/img/. /opt/app/frontend/public/img 2>/dev/null || true

if [ "$CADDY_DISABLED" != "true" ]; then
  # Start Caddy
  echo "Starting Caddy..."
  if [ "$TRUST_PROXY" = "true" ]; then
    caddy start --adapter caddyfile --config /opt/app/reverse-proxy/Caddyfile.trust-proxy &
  elif [ -f /opt/app/reverse-proxy/Caddyfile.prod ] && [ "$NODE_ENV" = "production" ]; then
    caddy start --adapter caddyfile --config /opt/app/reverse-proxy/Caddyfile.prod &
  else
    caddy start --adapter caddyfile --config /opt/app/reverse-proxy/Caddyfile &
  fi
else
  echo "Caddy is disabled. Skipping..."
fi

# Run the frontend server (Next.js standalone)
cd /opt/app/frontend
PORT=3333 HOSTNAME=0.0.0.0 node server.js &

# Run the backend server (NestJS)
cd /opt/app/backend
export DATABASE_URL="${DATABASE_URL:-file:./data/controle-videos.db}"
./node_modules/.bin/prisma migrate deploy
# NOTE: use the COMPILED seeds from dist/ (not tsx on prisma/seed/*.ts). The
# image ships only dist/, and the source seeds import from src/ (e.g.
# src/config/jwt-secret-crypto) which is not present at runtime. tsx would
# only resolve those imports if src/ were copied into the image.
node dist/prisma/seed/config.seed.js
node dist/prisma/seed/user.seed.js
node dist/src/main

# Wait for all processes to finish
wait -n