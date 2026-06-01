import type { ParsedArgs } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';
import { hostPortFromUrl, probeTcp } from '../util/net';

const USAGE = 'usage: fit queue <status [<queue>] | retry <jobId>>';

/**
 * BullMQ introspection. The queue/worker package is provisioned in a later
 * phase; until then this reports Redis (the BullMQ backend) reachability and an
 * empty queue list so callers get a stable, machine-parseable shape rather than
 * an error. Once workers exist this gains real per-queue counts.
 */
export async function run(args: ParsedArgs): Promise<CommandResult> {
  const [sub, arg] = args.positionals;
  const env = loadInfraEnv('local');

  switch (sub) {
    case 'status': {
      const target = hostPortFromUrl(env.REDIS_URL);
      const backend = target
        ? await probeTcp(target.host, target.port)
        : { status: 'error' as const, error: 'unparseable REDIS_URL' };
      return {
        data: {
          backend: 'redis',
          backendStatus: backend.status,
          queue: arg ?? null,
          queues: [],
          note: 'Queue workers are not yet provisioned; reporting backend reachability only.',
        },
      };
    }

    case 'retry': {
      if (!arg) {
        throw new CommandError('Missing jobId', { code: 'BAD_ARGUMENT', detail: USAGE });
      }
      throw new CommandError('Queue workers are not yet provisioned — nothing to retry', {
        code: 'NOT_PROVISIONED',
        detail: { jobId: arg },
      });
    }

    default:
      throw new CommandError(`Unknown 'queue' subcommand '${sub ?? ''}'`, {
        code: 'BAD_ARGUMENT',
        detail: USAGE,
      });
  }
}
