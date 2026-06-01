/**
 * Tiny, dependency-free argument parser for the `fit` CLI.
 *
 * Splits an argv tail into positionals and flags. Flags may be written as
 * `--flag value` or `--flag=value`; a flag with no following value (or followed
 * by another flag) is treated as a boolean `true`. Short-circuit flags like
 * `--pretty` therefore parse as `{ pretty: true }`.
 *
 * The CLI is deliberately non-interactive and scriptable, so parsing is strict
 * and predictable rather than clever.
 */
export interface ParsedArgs {
  /** Positional arguments, in order (command/subcommand already stripped). */
  positionals: string[];
  /** Flags keyed by name (without the leading `--`). */
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;

    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }

      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[body] = next;
        i += 1;
      } else {
        flags[body] = true;
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, flags };
}

/** Read a flag that must be a string; returns `undefined` for absent/boolean. */
export function stringFlag(
  flags: Record<string, string | boolean>,
  name: string,
): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

/** Read a boolean flag (`--flag` or `--flag=true`). */
export function boolFlag(flags: Record<string, string | boolean>, name: string): boolean {
  const value = flags[name];
  return value === true || value === 'true';
}
