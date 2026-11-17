#!/bin/sh
# Starts everything INNOSIGHT needs inside one container (used on Railway):
#   demo GraphQL API :5000 (internal)  ->  API server :4000 (internal)  ->  nginx on $PORT (public)
set -eu
cd /app

PUBLIC_PORT="${PORT:-8080}"
: "${DATABASE_URL:?DATABASE_URL is not set. In Railway add a PostgreSQL service and set DATABASE_URL=\${{Postgres.DATABASE_URL}} on this service.}"
export DEMO_API_URL="${DEMO_API_URL:-http://127.0.0.1:5000/graphql}"

sed "s/__PORT__/${PUBLIC_PORT}/" /app/infra/nginx.railway.conf > /tmp/nginx.conf

DEMO_PORT=5000 /app/node_modules/.bin/tsx apps/demo-api/src/index.ts & DEMO_PID=$!
PORT=4000 /app/node_modules/.bin/tsx apps/server/src/index.ts & API_PID=$!
nginx -e /dev/stderr -c /tmp/nginx.conf -g 'daemon off;' & WEB_PID=$!

stop() { kill "$WEB_PID" "$API_PID" "$DEMO_PID" 2>/dev/null || true; }
trap 'stop; exit 0' TERM INT

# If any process dies, stop the container so Railway restarts it.
while kill -0 "$DEMO_PID" 2>/dev/null && kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 2
done
echo "A process exited; shutting down." >&2
stop
exit 1
