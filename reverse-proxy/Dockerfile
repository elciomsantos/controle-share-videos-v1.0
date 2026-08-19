# =============================================================================
# Caddy with the rate_limit plugin (INFRA-HIGH-01)
#
# The stock caddy:2.9-alpine image does not ship the `rate_limit` directive,
# so we rebuild Caddy with github.com/mholt/caddy-ratelimit via xcaddy.
#
# Supply chain hardening (PLANO_HARDENING_DOCKER item 7): base images pinned by
# digest (manifest multi-arch). Renovar via Renovate/Dependabot.
# =============================================================================
FROM caddy@sha256:1609bfce85bd4452a875e4d459f25e602c484b5a36e9c015511b5bdbd3539784 AS builder

RUN xcaddy build --with github.com/mholt/caddy-ratelimit

FROM caddy@sha256:b4e3952384eb9524a887633ce65c752dd7c71314d2c2acf98cd5c715aaa534f0

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# DOP-05: wrapper que expande *_FILE (Docker secrets) para {$DOMAIN}/{$ACME_EMAIL}
COPY entrypoint.sh /usr/local/bin/caddy-entrypoint.sh
RUN chmod +x /usr/local/bin/caddy-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/caddy-entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
