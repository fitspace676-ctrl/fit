#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Brings up a full, self-contained dev environment inside the remote sandbox so
# the whole Fit stack — unit + integration tests, migrations, seed, and a live
# API — works without any external services.
#
# Why local datastores? The sandbox network only permits HTTP/HTTPS egress
# through the agent proxy; raw TCP to a managed database (Railway's public proxy)
# is blocked, and the Docker registry is unreachable too. So we run Postgres and
# Redis locally inside the sandbox — the same major versions as production
# (PostgreSQL 16, Redis 7) that ship preinstalled here. The container is
# ephemeral, so the cluster is (re)created each cold start; `FIT_SANDBOX_SEED`
# opts into seeding demo data.
#
# No secrets live in this file. Optional third-party keys (OAuth, R2, Resend)
# come from the environment secret store when set.
set -euo pipefail

# Only run inside Claude Code on the web (remote) sandboxes. Local dev untouched.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# The repo pins pnpm via package.json "packageManager"; make sure it is on PATH.
corepack enable >/dev/null 2>&1 || true

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
PGDATA=/var/lib/postgresql/fit-dev
PGPORT=5432
PGLOG=/var/lib/postgresql/fit-dev.log
DB_UP=0

start_postgres() {
  if [ -z "$PGBIN" ]; then
    echo "session-start: WARN no PostgreSQL binaries found — skipping local DB."
    return 1
  fi
  # Idempotent: reuse an already-running cluster (e.g. on session resume).
  if "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" -q 2>/dev/null; then
    echo "session-start: Postgres already running."
    return 0
  fi
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "session-start: initializing Postgres cluster…"
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
    sudo -u postgres "$PGBIN/initdb" -D "$PGDATA" --auth=trust --username=postgres >/dev/null
  fi
  echo "session-start: starting Postgres…"
  # pg_ctl properly daemonizes so the server survives this hook exiting.
  sudo -u postgres "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGLOG" \
    -o "-k /tmp -c listen_addresses=127.0.0.1 -p $PGPORT" -w start || return 1
  # Ensure the dev database exists (ignore "already exists").
  "$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres fit 2>/dev/null || true
  return 0
}

start_redis() {
  if redis-cli -p 6379 ping >/dev/null 2>&1; then
    echo "session-start: Redis already running."
    return 0
  fi
  echo "session-start: starting Redis…"
  redis-server --daemonize yes --port 6379 --dir /var/lib/postgresql >/dev/null 2>&1 \
    || echo "session-start: WARN Redis failed to start."
}

if start_postgres; then DB_UP=1; fi
start_redis

# ── Session environment ──────────────────────────────────────────────────────
# The local datastores win over any inherited values, because an external
# managed DB is not reachable from this sandbox. JWT_SECRET is honoured from the
# secret store if set, else a fresh dev secret is generated (never committed).
LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:5432/fit?schema=public"
LOCAL_REDIS="redis://127.0.0.1:6379"

export DATABASE_URL="$LOCAL_DB"
export REDIS_URL="$LOCAL_REDIS"
echo "export DATABASE_URL=\"$LOCAL_DB\"" >> "$CLAUDE_ENV_FILE"
echo "export REDIS_URL=\"$LOCAL_REDIS\"" >> "$CLAUDE_ENV_FILE"

if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  export JWT_SECRET
  echo "export JWT_SECRET=\"$JWT_SECRET\"" >> "$CLAUDE_ENV_FILE"
fi

# ── Dependencies + Prisma client ─────────────────────────────────────────────
echo "session-start: installing dependencies (pnpm install)…"
pnpm install

echo "session-start: generating Prisma client (pnpm db:generate)…"
pnpm db:generate

# ── Migrate (+ optional seed) once the DB is confirmed up ────────────────────
if [ "$DB_UP" = "1" ] && "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" -q 2>/dev/null; then
  echo "session-start: applying migrations (pnpm db:migrate)…"
  pnpm db:migrate || echo "session-start: WARN migrate failed."

  # Seed is opt-in (FIT_SANDBOX_SEED=true) so it never runs unasked.
  if [ "${FIT_SANDBOX_SEED:-}" = "true" ]; then
    echo "session-start: seeding demo data (pnpm db:seed)…"
    pnpm db:seed || echo "session-start: WARN seed failed."
  fi
else
  echo "session-start: DB not up — skipping migrations (unit/lint/build still work)."
fi

echo "session-start: Fit dev sandbox ready — Postgres, Redis, deps, Prisma client."
