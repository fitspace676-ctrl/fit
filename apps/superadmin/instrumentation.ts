// Validate the environment once, before anything else runs on the server. The
// import's side effect throws on a malformed var (fail-fast); see `lib/env.ts`.
// Next.js calls `register()` once per runtime before any request is handled.
import './lib/env';

export function register(): void {
  // Env validation runs on import above; nothing else to bootstrap here yet.
}
