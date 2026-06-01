import { EnvValidationError, infraEnvSchema, isSecretInfraKey } from '@fit/env';
import type { ParsedArgs } from '../args';
import { stringFlag } from '../args';
import { CommandError, type CommandResult } from '../output';
import { isEnvTarget, loadInfraEnv, loadRawEnv, type EnvTarget } from '../env-source';

const USAGE = 'usage: fit env <get <KEY> | check> [--env local|preview|prod]';

function resolveTarget(flags: ParsedArgs['flags']): EnvTarget {
  const raw = stringFlag(flags, 'env') ?? 'local';
  if (!isEnvTarget(raw)) {
    throw new CommandError(`Unknown --env target '${raw}' (expected local|preview|prod)`, {
      code: 'BAD_ARGUMENT',
    });
  }
  return raw;
}

/** `fit env get <KEY> [--env]` — print one schema-validated value. */
function get(positionals: string[], target: EnvTarget): CommandResult {
  const key = positionals[0];
  if (!key) {
    throw new CommandError('Missing KEY argument', { code: 'BAD_ARGUMENT', detail: USAGE });
  }

  // Validate the whole infra environment first so a typo'd/invalid value can't
  // be returned as if it were good. Then read the requested key from the raw
  // source so non-schema keys are still retrievable.
  let validated: Record<string, unknown> | undefined;
  try {
    validated = loadInfraEnv(target);
  } catch (err) {
    if (err instanceof EnvValidationError) {
      throw new CommandError('Environment failed validation', {
        code: 'INVALID_ENV',
        detail: { issues: err.issues, env: target },
      });
    }
    throw err;
  }

  const raw = loadRawEnv(target);
  const value = key in validated ? validated[key] : raw[key];

  if (value === undefined) {
    throw new CommandError(`'${key}' is not set in the '${target}' environment`, {
      code: 'MISSING_ENV',
      detail: { key, env: target },
    });
  }

  return { data: { key, value, env: target, secret: isSecretInfraKey(key) } };
}

/** `fit env check [--env]` — validate the whole infra environment. */
function check(target: EnvTarget): CommandResult {
  try {
    const validated = loadInfraEnv(target) as unknown as Record<string, unknown>;
    // Report which keys are set, but never their (possibly secret) values.
    const keys = Object.keys(infraEnvSchema.shape).filter((k) => validated[k] !== undefined);
    return { data: { ok: true, env: target, validatedKeys: keys.sort() } };
  } catch (err) {
    if (err instanceof EnvValidationError) {
      throw new CommandError('Environment failed validation', {
        code: 'INVALID_ENV',
        detail: { issues: err.issues, env: target },
        exitCode: 1,
      });
    }
    throw err;
  }
}

export function run(args: ParsedArgs): Promise<CommandResult> {
  const [sub, ...rest] = args.positionals;
  const target = resolveTarget(args.flags);

  switch (sub) {
    case 'get':
      return Promise.resolve(get(rest, target));
    case 'check':
      return Promise.resolve(check(target));
    default:
      throw new CommandError(`Unknown 'env' subcommand '${sub ?? ''}'`, {
        code: 'BAD_ARGUMENT',
        detail: USAGE,
      });
  }
}
