ARG NODE_IMAGE=node:24-bookworm-slim
ARG CADDY_IMAGE=caddy:2.10-alpine
ARG ALPINE_IMAGE=alpine:3.22

FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN npm install --global pnpm@12.16.1
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM ${CADDY_IMAGE} AS caddy

FROM ${ALPINE_IMAGE} AS runtime
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="ysocial-admin" \
      org.opencontainers.image.source="https://github.com/ysocialoss/web-admin" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

RUN addgroup -g 1001 -S web && adduser -S -u 1001 -G web web
RUN --mount=from=caddy,source=/usr/bin/caddy,target=/tmp/caddy cp /tmp/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=web:web /app/dist /srv

ENV SITE_ADDRESS=:8080 \
    API_URL=http://127.0.0.1:3100 \
    WEB_ROOT=/srv \
    AUTO_HTTPS=off \
    XDG_DATA_HOME=/tmp/caddy-data \
    XDG_CONFIG_HOME=/tmp/caddy-config

USER 1001:1001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
