/**
 * Output helpers. Every command emits JSON so callers can parse it; `--pretty`
 * switches from compact (single-line, the default) to 2-space indented JSON for
 * humans. Results go to stdout, errors to stderr, and the process exit code
 * carries success/failure for scripts that only check `$?`.
 */

/** A command's structured result plus the exit code it should produce. */
export interface CommandResult {
  /** JSON-serializable payload printed to stdout. */
  data: unknown;
  /** Process exit code (0 = success). Defaults to 0 when omitted. */
  exitCode?: number;
}

/** Standard error shape so failures are machine-parseable too. */
export interface ErrorPayload {
  ok: false;
  error: string;
  /** Optional machine-readable code, e.g. `MISSING_ENV`, `VENDOR_CLI_MISSING`. */
  code?: string;
  /** Optional extra detail (validation issues, command attempted, …). */
  detail?: unknown;
}

export function serialize(data: unknown, pretty: boolean): string {
  return JSON.stringify(data, null, pretty ? 2 : undefined);
}

/** Print a successful result to stdout in the requested format. */
export function printResult(data: unknown, pretty: boolean): void {
  process.stdout.write(`${serialize(data, pretty)}\n`);
}

/** Print an error payload to stderr in the requested format. */
export function printError(payload: ErrorPayload, pretty: boolean): void {
  process.stderr.write(`${serialize(payload, pretty)}\n`);
}

/**
 * A command failure carrying the structured payload and the exit code to use.
 * Commands throw this; the router catches it and renders consistently.
 */
export class CommandError extends Error {
  readonly payload: ErrorPayload;
  readonly exitCode: number;

  constructor(error: string, options: { code?: string; detail?: unknown; exitCode?: number } = {}) {
    super(error);
    this.name = 'CommandError';
    this.payload = { ok: false, error, code: options.code, detail: options.detail };
    this.exitCode = options.exitCode ?? 1;
  }
}
