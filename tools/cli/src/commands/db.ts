import type { ParsedArgs } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';
import { delegate } from '../util/exec';

const USAGE = 'usage: fit db <url|migrate|studio|seed|reset|generate-instances>';

/**
 * Database access. `url` reads the validated `DATABASE_URL` from the shared
 * schema; the rest delegate to the root `db:*` pnpm scripts (which wrap Prisma),
 * so there is one definition of what "migrate" means across the repo.
 */
export async function run(args: ParsedArgs): Promise<CommandResult> {
  const [sub] = args.positionals;

  switch (sub) {
    case 'url': {
      const env = loadInfraEnv('local');
      return { data: { databaseUrl: env.DATABASE_URL, secret: true } };
    }
    case 'migrate':
      return delegated(['db:migrate']);
    case 'studio':
      return delegated(['db:studio']);
    case 'reset':
      // `migrate reset` is destructive; Prisma prompts unless --force is passed.
      return delegated(['--filter', '@fit/db', 'exec', 'prisma', 'migrate', 'reset', '--force']);
    case 'seed':
      return delegated(['--filter', '@fit/db', 'exec', 'prisma', 'db', 'seed']);
    case 'generate-instances':
      // Materialise class occurrences 4 weeks ahead from every active template
      // (T5.3). Idempotent — safe to run on a schedule.
      return delegated(['db:generate-instances']);
    default:
      throw new CommandError(`Unknown 'db' subcommand '${sub ?? ''}'`, {
        code: 'BAD_ARGUMENT',
        detail: USAGE,
      });
  }
}

async function delegated(pnpmArgs: string[]): Promise<CommandResult> {
  const code = await delegate('pnpm', pnpmArgs);
  return {
    data: { ok: code === 0, command: `pnpm ${pnpmArgs.join(' ')}`, exitCode: code },
    exitCode: code,
  };
}
