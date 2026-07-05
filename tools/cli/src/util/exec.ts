import { spawn, spawnSync } from 'node:child_process';
import { CommandError } from '../output';

/**
 * Whether an executable is resolvable on the current PATH.
 *
 * The POSIX probe is the shell builtin `command -v`, so it MUST run through a
 * shell — spawning `command` as a bare executable ENOENTs on Linux/macOS (there
 * is no `/usr/bin/command`) and would report every CLI as missing. `command` is
 * always an internal, hardcoded vendor name, never user input.
 */
export function isCommandAvailable(command: string): boolean {
  const probe = process.platform === 'win32' ? `where ${command}` : `command -v ${command}`;
  const result = spawnSync(probe, { stdio: 'ignore', shell: true });
  return result.status === 0;
}

/**
 * Run a vendor CLI (`railway`, `vercel`, `wrangler`, `prisma`, `pnpm`) inheriting
 * stdio so its native, interactive-free output streams straight through. Used
 * by the delegating commands (`db migrate`, `deploy`, `logs`). Resolves with the
 * child's exit code; throws {@link CommandError} if the binary is missing so the
 * caller emits a structured `VENDOR_CLI_MISSING` error instead of a stack trace.
 */
export function delegate(command: string, args: readonly string[]): Promise<number> {
  if (!isCommandAvailable(command)) {
    return Promise.reject(
      new CommandError(`Required CLI '${command}' is not installed or not on PATH`, {
        code: 'VENDOR_CLI_MISSING',
        detail: { command, args },
      }),
    );
  }

  return new Promise<number>((resolvePromise, reject) => {
    const child = spawn(command, [...args], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolvePromise(code ?? 0));
  });
}
