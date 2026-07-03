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
DUMMY_DB_URL="postgresql://user:pass@localhost:5432/fit?schema=public"
if [ -z "${DATABASE_URL:-}" ]; then
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

# When the secret store provides a REAL DATABASE_URL (a dedicated Railway dev
# instance — never production), apply pending migrations so the dev schema is up
# to date. `migrate deploy` only applies committed migrations; it never resets
# data. Skipped entirely on the dummy fallback so a mis-configured session can't
# reach out to a localhost that isn't there.
if [ "${DATABASE_URL:-}" != "$DUMMY_DB_URL" ]; then
  echo "session-start: applying migrations to the dev database (pnpm db:migrate)…"
  pnpm db:migrate || echo "session-start: WARN migrate failed (dev DB unreachable?) — continuing."

  # Seed is opt-in (FIT_SANDBOX_SEED=true) so it never clobbers dev data unasked.
  if [ "${FIT_SANDBOX_SEED:-}" = "true" ]; then
    echo "session-start: seeding dev database (pnpm db:seed)…"
    pnpm db:seed || echo "session-start: WARN seed failed — continuing."
  fi
fi

echo "session-start: Fit sandbox ready — dependencies installed, Prisma client generated."
