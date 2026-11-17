# syntax=docker/dockerfile:1
FROM node:24-alpine AS source
WORKDIR /app
COPY --chown=node:node . .
FROM source AS runtime
RUN npm ci --omit=dev --workspace apps/server --workspace apps/demo-api --workspace packages/shared --include-workspace-root && npm cache clean --force
USER node
FROM source AS web-build
RUN npm ci && npm run build -w apps/web && npm cache clean --force
FROM nginx:1.28-alpine AS web
COPY --chmod=644 infra/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

# ---------------------------------------------------------------------------
# Railway (and any single-container host): nginx + API + demo API in one image.
# It is the LAST stage, so platforms that build the default stage pick it up.
# docker compose is unaffected because it always names its target explicitly.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS railway
RUN apk add --no-cache nginx
WORKDIR /app
COPY --from=runtime /app /app
COPY --from=web-build --chown=node:node /app/apps/web/dist /usr/share/nginx/html
RUN sed -i 's/\r$//' /app/infra/railway-start.sh /app/infra/nginx.railway.conf && chmod +x /app/infra/railway-start.sh
USER node
ENV NODE_ENV=production
EXPOSE 8080
CMD ["/app/infra/railway-start.sh"]
