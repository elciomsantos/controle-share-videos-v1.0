#!/bin/sh

# Copy default logo to the frontend public folder if it doesn't exist
cp -rn /tmp/img/* /opt/app/frontend/public/img

if [ "$CADDY_DISABLED" != "true" ]; then
  # Start Caddy
  echo "Starting Caddy..."
  if [ "$TRUST_PROXY" = "true" ]; then
    caddy start --adapter caddyfile --config /opt/app/reverse-proxy/Caddyfile.trust-proxy &
  else
    caddy start --adapter caddyfile --config /opt/app/reverse-proxy/Caddyfile &
  fi
else
  echo "Caddy is disabled. Skipping..."
fi

# Run the frontend server
PORT=3333 HOSTNAME=0.0.0.0 node frontend/server.js &

# Run the backend server
cd backend && export DATABASE_URL="${DATABASE_URL:-file:./data/controle-videos.db}" && ./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/prisma db seed && ./node_modules/.bin/tsx prisma/seed/user.seed.ts && node dist/src/main

# Wait for all processes to finish
wait -n
