#!/bin/sh
# Applies migrations (idempotent — see migrations/run-migrations.ts) before
# every boot, then starts the server the same way `npm run dev` does
# locally. Postgres readiness itself is handled by docker-compose's
# `depends_on: condition: service_healthy`, not by this script.
set -e

echo "Running database migrations..."
npm run db:migrate

echo "Starting server..."
exec npx ts-node src/main/server.ts
