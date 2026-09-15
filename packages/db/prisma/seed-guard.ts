// Refuses to run a dev seed against a production database.
//
// `seed.ts` and `seed-mobile-smoke.ts` write public, well-known fixtures (the
// `alex@example.com` / `sam@example.com` logins with the shared dev password).
// Run against a real database they hand anyone a working account, so both
// scripts call {@link exitIfUnsafeSeedTarget} before touching the database.
//
// A target counts as unsafe when `NODE_ENV` is `production`, or when
// `DATABASE_URL` points anywhere but a local/container host. CI seeds a
// `postgres` service reached at `localhost`, local dev uses `localhost` or a
// compose service name (`postgres`, `db`) — anything with a domain in it
// (`*.railway.internal`, `*.proxy.rlwy.net`, a managed cloud host) is refused.
// Set `ALLOW_SEED_PRODUCTION=1` to seed such a database deliberately.

export const SEED_OVERRIDE_ENV = 'ALLOW_SEED_PRODUCTION';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db']);

type SeedEnv = Record<string, string | undefined>;

/** Why seeding `env`'s database is unsafe, or `null` when it looks local. */
export function unsafeSeedTargetReason(env: SeedEnv): string | null {
  if (env.NODE_ENV === 'production') {
    return 'NODE_ENV is "production"';
  }

  const url = env.DATABASE_URL;
  // No URL: Prisma fails on its own before any write, nothing to guard.
  if (!url) return null;

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return 'DATABASE_URL is not a parseable URL, so it cannot be shown to be local';
  }

  // An empty host is a Unix-socket connection (`postgresql:///fit?host=/tmp`).
  if (hostname === '' || LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost')) {
    return null;
  }
  // A bare single-label name is a container/compose service; anything dotted
  // (including `*.internal` private networks) is a real host.
  if (!hostname.includes('.') && !hostname.includes(':')) {
    return null;
  }
  return `DATABASE_URL points at a non-local host (${hostname})`;
}

/**
 * Throws when the seed target is unsafe and the override is not set. Returns
 * whether the override was used to get past a refusal.
 */
export function assertSafeSeedTarget(script: string, env: SeedEnv = process.env): boolean {
  const reason = unsafeSeedTargetReason(env);
  if (!reason) return false;
  if (env[SEED_OVERRIDE_ENV] === '1') return true;
  throw new Error(
    `[@fit/db] ${script}: refusing to seed — ${reason}. ` +
      'This script writes public dev fixtures (known logins and passwords) and must never run ' +
      `against production. Set ${SEED_OVERRIDE_ENV}=1 to seed this database anyway.`,
  );
}

/** Script entry guard: exits non-zero with the refusal before any query runs. */
export function exitIfUnsafeSeedTarget(script: string): void {
  try {
    if (assertSafeSeedTarget(script)) {
      console.warn(
        `[@fit/db] ${script}: ${SEED_OVERRIDE_ENV}=1 is set — seeding a non-local database.`,
      );
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
