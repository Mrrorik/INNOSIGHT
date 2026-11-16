# syntax=docker/dockerfile:1
FROM node:24-alpine AS source
WORKDIR /app
COPY --chown=node:node . .
FROM source AS runtime
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --workspace apps/server --workspace apps/demo-api --workspace packages/shared --include-workspace-root && npm cache clean --force
USER node
FROM source AS web-build
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci && npm run build -w apps/web && npm cache clean --force
FROM nginx:1.28-alpine AS web
COPY --chmod=644 infra/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
