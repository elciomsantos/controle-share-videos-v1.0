#!/bin/sh

# Copy default images (including the images/ subdir) to the frontend public
# folder if they don't already exist — self-heals the images volume on fresh
# deploys.
cp -rn /tmp/img/. /opt/app/frontend/public/img 2>/dev/null || true

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
./node_modules/.bin/prisma db seed
./node_modules/.bin/tsx prisma/seed/user.seed.ts
node dist/src/main

# Wait for all processes to finish
wait -n