# =============================================================================
# Caddy with the rate_limit plugin (INFRA-HIGH-01)
#
# The stock caddy:2.9-alpine image does not ship the `rate_limit` directive,
# so we rebuild Caddy with github.com/mholt/caddy-ratelimit via xcaddy.
# =============================================================================
FROM caddy:2.9-builder AS builder

RUN xcaddy build --with github.com/mholt/caddy-ratelimit

FROM caddy:2.9-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
