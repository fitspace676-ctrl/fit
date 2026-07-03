#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Prepares the Fit monorepo so tests, linters, type-checks and builds work in a
# fresh remote sandbox: installs workspace dependencies and generates the Prisma
# client. It deliberately does NOT connect to any database, run migrations, or
# run integration tests — the managed Postgres/Redis is production, so nothing
# here touches it. Real values (DATABASE_URL, REDIS_URL, JWT_SECRET, …) come from
# the environment's secret store; no secrets live in this file.
set -euo pipefail

# Only run inside Claude Code on the web (remote) sandboxes. Local dev is untouched.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# The repo pins pnpm via package.json "packageManager"; make sure it is on PATH.
corepack enable >/dev/null 2>&1 || true

# Prisma's schema references env("DATABASE_URL"), so `prisma generate` needs the
# variable to be *present* — it does not open a connection. When the secret store
# has not been configured yet, fall back to a harmless dummy so generation, type
# checks and unit tests (which mock the DB) still work. If the store provides a
# real DATABASE_URL it is already in the environment and this block is skipped.
if [ -z "${DATABASE_URL:-}" ]; then
  DUMMY_DB_URL="postgresql://user:pass@localhost:5432/fit?schema=public"
  export DATABASE_URL="$DUMMY_DB_URL"
  echo "export DATABASE_URL=\"$DUMMY_DB_URL\"" >> "$CLAUDE_ENV_FILE"
  echo "session-start: DATABASE_URL not set — using a dummy URL for Prisma generate only."
fi

# Install workspace dependencies. `install` (not `ci`) so the cached container
# layer is reused across sessions; idempotent when nothing changed.
echo "session-start: installing dependencies (pnpm install)…"
pnpm install

# Generate the Prisma client into packages/db (offline; no DB connection).
echo "session-start: generating Prisma client (pnpm db:generate)…"
pnpm db:generate

echo "session-start: Fit sandbox ready — dependencies installed, Prisma client generated."
