import type { ParsedArgs } from '../args';
import { stringFlag } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';
import { runOnboard } from './onboard';

const USAGE =
  'usage: fit gym <create --name <name> --slug <slug> [--owner-email <email>] | ' +
  'onboard --name <name> --slug <slug> --owner-email <email> [--members <n>] [--roster <file>] [--dry-run] | ' +
  'list>';

/**
 * Tenant provisioning helpers. `create` / `list` wrap the API's gym endpoints so
 * tasks can spin up / enumerate test tenants without hand-crafting HTTP calls;
 * `onboard` (T10.7) stands up a whole pilot gym directly against the database
 * (owner, staff, plans, schedule, members) in one idempotent call.
 */
export async function run(args: ParsedArgs): Promise<CommandResult> {
  const [sub] = args.positionals;

  // `onboard` talks to the database, not the API — dispatch it before we resolve
  // the API base so it never depends on a reachable API URL.
  if (sub === 'onboard') {
    return runOnboard(args);
  }

  const env = loadInfraEnv('local');
  const base = env.API_URL.replace(/\/$/, '');

  switch (sub) {
    case 'create': {
      const name = stringFlag(args.flags, 'name');
      const slug = stringFlag(args.flags, 'slug');
      if (!name || !slug) {
        throw new CommandError('Both --name and --slug are required', {
          code: 'BAD_ARGUMENT',
          detail: USAGE,
        });
      }
      const ownerEmail = stringFlag(args.flags, 'owner-email');
      // The `--name` / `--slug` flags map to the API's `gymName` / `subdomainSlug`
      // body fields (the register-gym contract, T2.11).
      return request('POST', `${base}/auth/register-gym`, {
        gymName: name,
        subdomainSlug: slug,
        ownerEmail,
      });
    }

    case 'list':
      return request('GET', `${base}/gyms`);

    default:
      throw new CommandError(`Unknown 'gym' subcommand '${sub ?? ''}'`, {
        code: 'BAD_ARGUMENT',
        detail: USAGE,
      });
  }
}

async function request(method: string, url: string, body?: unknown): Promise<CommandResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new CommandError(`Could not reach the API at ${url}`, {
      code: 'API_UNREACHABLE',
      detail: { url, cause: err instanceof Error ? err.message : String(err) },
    });
  }
  const text = await res.text();
  const parsed = safeJson(text);
  if (!res.ok) {
    throw new CommandError(`API returned HTTP ${res.status}`, {
      code: 'API_ERROR',
      detail: { url, status: res.status, body: parsed },
    });
  }
  return { data: parsed };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
