#!/usr/bin/env tsx
/**
 * CI guard: every environment variable declared in an app's Zod env schema must
 * be documented in a `.env.example`. Catches the common drift where code starts
 * reading a new variable but the example file (the onboarding contract) is never
 * updated, so a fresh clone or deploy fails at boot with a missing var.
 *
 * Purely textual on purpose — it never imports the schema modules, because those
 * validate `process.env` at load and would crash this check in a bare CI shell.
 *
 * Exit code 1 (with the offending names) when a schema var is undocumented.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

/**
 * Each Zod env schema paired with the `.env.example` that must document its
 * keys. Checked per-pair (an app's schema against its *own* example), so a var
 * documented in one app's example never masks its absence in another's.
 */
const AUDITS: { schema: string; example: string }[] = [
  { schema: 'apps/api/src/config/env.ts', example: '.env.example' },
  { schema: 'apps/web/lib/env.ts', example: 'apps/web/.env.example' },
  { schema: 'apps/admin/lib/env.ts', example: 'apps/admin/.env.example' },
  { schema: 'apps/superadmin/lib/env.ts', example: 'apps/superadmin/.env.example' },
  { schema: 'apps/platform/lib/env.ts', example: 'apps/platform/.env.example' },
  { schema: 'apps/mobile/lib/env.ts', example: 'apps/mobile/.env.example' },
];

/** Vars provided by the runtime/framework, never written to `.env.example`. */
const IGNORED = new Set(['NODE_ENV', 'PORT', 'NEXT_RUNTIME']);

/** Extract `KEY: z....` property names from a Zod object schema source file. */
function schemaKeys(file: string): Set<string> {
  const source = readFileSync(resolve(ROOT, file), 'utf8');
  const keys = new Set<string>();
  for (const match of source.matchAll(/^\s*([A-Z][A-Z0-9_]*):\s*z\./gm)) {
    keys.add(match[1]!);
  }
  return keys;
}

/** Extract documented keys from a `.env.example` (commented lines count). */
function documentedKeys(file: string): Set<string> {
  const source = readFileSync(resolve(ROOT, file), 'utf8');
  const keys = new Set<string>();
  for (const match of source.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)\s*=/gm)) {
    keys.add(match[1]!);
  }
  return keys;
}

function main(): void {
  const missing: string[] = [];
  for (const { schema, example } of AUDITS) {
    const documented = documentedKeys(example);
    for (const key of schemaKeys(schema)) {
      if (!IGNORED.has(key) && !documented.has(key)) {
        missing.push(`${key}  (declared in ${schema}, missing from ${example})`);
      }
    }
  }

  if (missing.length > 0) {
    console.error('✖ Env vars declared in code but missing from .env.example:\n');
    for (const line of missing) console.error(`  • ${line}`);
    console.error('\nAdd them to the matching .env.example (a commented placeholder is fine).');
    process.exit(1);
  }

  console.log(`✔ All ${AUDITS.length} env schemas are fully documented in their .env.example.`);
}

main();
