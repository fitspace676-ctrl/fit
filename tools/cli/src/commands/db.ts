import type { ParsedArgs } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';
import { delegate } from '../util/exec';
import { runRestore, runSnapshot } from './snapshot';

const USAGE = 'usage: fit db <url|migrate|snapshot|restore|studio|seed|reset|generate-instances>';

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
    case 'snapshot':
      // Pre-deploy safety net: dump the DB (and copy to R2 when configured)
      // before `migrate deploy` runs. See ROLLBACK.md.
      return runSnapshot(subArgs(args));
    case 'restore':
      // Destructive: replace the DB from a dump — the rollback half of a bad
      // migration. Run deliberately against an explicit target.
      return runRestore(subArgs(args));
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

/** Drop the `db` subcommand from positionals so a handler sees its own args. */
function subArgs(args: ParsedArgs): ParsedArgs {
  return { flags: args.flags, positionals: args.positionals.slice(1) };
}

async function delegated(pnpmArgs: string[]): Promise<CommandResult> {
  const code = await delegate('pnpm', pnpmArgs);
  return {
    data: { ok: code === 0, command: `pnpm ${pnpmArgs.join(' ')}`, exitCode: code },
    exitCode: code,
  };
}
