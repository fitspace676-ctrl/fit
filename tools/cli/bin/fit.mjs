#!/usr/bin/env node
// `fit` binary entry point.
//
// The CLI sources are TypeScript and run through `tsx` (no build step), so this
// thin launcher resolves the workspace `tsx` and re-execs it against
// `src/index.ts`, forwarding all arguments. This keeps `node_modules/.bin/fit`
// working from any workspace while the implementation stays in TS.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../src/index.ts');
const require = createRequire(import.meta.url);

// Resolve tsx's CLI from this package's dependency tree so we don't depend on
// it being on PATH.
const tsxBin = require.resolve('tsx/cli');

const child = spawn(process.execPath, [tsxBin, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
