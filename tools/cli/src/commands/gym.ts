import type { ParsedArgs } from '../args';
import { stringFlag } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';

const USAGE = 'usage: fit gym <create --name <name> --slug <slug> [--owner-email <email>] | list>';

/**
 * Tenant provisioning helpers. These wrap the API's gym endpoints so tasks can
 * spin up / enumerate test tenants without hand-crafting HTTP calls. The
 * endpoints land in Phase 2 (auth); until then the command surfaces a clear
 * `API_UNREACHABLE` error rather than guessing.
 */
export async function run(args: ParsedArgs): Promise<CommandResult> {
  const [sub] = args.positionals;
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
      return request('POST', `${base}/auth/register-gym`, { name, slug, ownerEmail });
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
