import type { ParsedArgs } from '../args';
import { stringFlag } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';
import { signJwt } from '../util/jwt';

const USAGE = 'usage: fit token --role <ROLE> --gym <slug> [--sub <userId>] [--ttl <seconds>]';

/** Roles the API recognizes (mirrors the planned `Role` enum). */
export const ROLES = [
  'SUPER_ADMIN',
  'OWNER',
  'MANAGER',
  'RECEPTIONIST',
  'TRAINER',
  'MEMBER',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * `fit token --role <ROLE> --gym <slug>` — mint a short-lived HS256 JWT signed
 * with the shared `JWT_SECRET` for local/integration testing of protected
 * endpoints. Never invents a secret: if `JWT_SECRET` is unset the command fails
 * loudly rather than producing a token nothing will accept.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- async so synchronous validation throws surface as rejections to callers using `.rejects`.
export async function run(args: ParsedArgs): Promise<CommandResult> {
  const role = stringFlag(args.flags, 'role');
  const gym = stringFlag(args.flags, 'gym');
  const sub = stringFlag(args.flags, 'sub') ?? 'cli-test-user';
  const ttlRaw = stringFlag(args.flags, 'ttl');

  if (!role || !gym) {
    throw new CommandError('Both --role and --gym are required', {
      code: 'BAD_ARGUMENT',
      detail: USAGE,
    });
  }
  if (!isRole(role)) {
    throw new CommandError(`Unknown --role '${role}' (expected one of ${ROLES.join(', ')})`, {
      code: 'BAD_ARGUMENT',
    });
  }

  const ttl = ttlRaw === undefined ? 3600 : Number(ttlRaw);
  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new CommandError(`--ttl must be a positive integer (got '${ttlRaw}')`, {
      code: 'BAD_ARGUMENT',
    });
  }

  const env = loadInfraEnv('local');
  if (!env.JWT_SECRET) {
    throw new CommandError('JWT_SECRET is not set — cannot mint a token', {
      code: 'MISSING_ENV',
      detail: { key: 'JWT_SECRET' },
    });
  }

  const token = signJwt({ sub, role, gym }, env.JWT_SECRET, {
    expiresInSeconds: ttl,
    issuer: env.JWT_ISSUER,
  });

  return { data: { token, role, gym, sub, expiresInSeconds: ttl } };
}
