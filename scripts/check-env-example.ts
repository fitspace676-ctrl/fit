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

/** Zod env schemas whose keys must all be documented. */
const SCHEMA_FILES = ['apps/api/src/config/env.ts'];

/** Files that document available env vars (`KEY=` or `# KEY=`). */
const ENV_EXAMPLE_FILES = ['.env.example'];

/** Vars provided by the runtime/framework, never written to `.env.example`. */
const IGNORED = new Set(['NODE_ENV', 'PORT']);

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
  const documented = new Set<string>();
  for (const file of ENV_EXAMPLE_FILES) {
    for (const key of documentedKeys(file)) documented.add(key);
  }

  const missing: string[] = [];
  for (const file of SCHEMA_FILES) {
    for (const key of schemaKeys(file)) {
      if (!IGNORED.has(key) && !documented.has(key)) {
        missing.push(`${key}  (declared in ${file})`);
      }
    }
  }

  if (missing.length > 0) {
    console.error('✖ Env vars declared in code but missing from .env.example:\n');
    for (const line of missing) console.error(`  • ${line}`);
    console.error('\nAdd them to .env.example (a commented placeholder is fine) and retry.');
    process.exit(1);
  }

  console.log('✔ .env.example documents every schema-declared env var.');
}

main();
