/**
 * `fit` — the unified project CLI for infra/env introspection.
 *
 * One scriptable entry point any task can call to fetch a runtime detail
 * (connection string, service health, signed URL, test token, …) instead of
 * hardcoding it. Output is JSON by default so scripts can parse it; pass
 * `--pretty` for indented, human-readable JSON. The CLI is non-interactive by
 * design — there is no TUI.
 */
import { parseArgs, boolFlag } from './args';
import { CommandError, printError, printResult, type CommandResult } from './output';
import * as env from './commands/env';
import * as db from './commands/db';
import * as services from './commands/services';
import * as token from './commands/token';
import * as r2 from './commands/r2';
import * as queue from './commands/queue';
import { runDeploy, runLogs } from './commands/deploy';
import * as gym from './commands/gym';
import * as admin from './commands/admin';
import type { ParsedArgs } from './args';

const HELP = `fit — unified project CLI for infra/env introspection

usage: fit <command> [subcommand] [args] [--pretty]

commands:
  env get <KEY> [--env local|preview|prod]   print one schema-validated env value
  env check [--env ...]                       validate the whole infra environment
  db url|migrate|studio|seed|reset            database access (wraps Prisma)
  db generate-instances                       materialise class occurrences 4 weeks ahead (T5.3)
  services status|health                      probe Postgres / Redis / API / R2
  token --role <ROLE> --gym <slug>            mint a test JWT (HS256, shared secret)
  r2 config | sign <key>                      storage config / presigned upload URL
  queue status [<queue>] | retry <jobId>      BullMQ introspection
  deploy <app> [--env preview|prod]           deploy an app (wraps vercel/railway/eas)
  logs <app>                                  tail an app's logs
  gym create --name --slug | list             tenant provisioning helpers
  admin grant|revoke --email <email> | list   manage platform SUPER_ADMINs

global flags:
  --pretty    indent JSON output for humans (default: compact, single line)
  --help      show this help

All output is JSON. Commands exit non-zero on failure (missing/invalid env,
unreachable service, vendor CLI not installed, …).`;

type Handler = (args: ParsedArgs) => Promise<CommandResult> | CommandResult;

const COMMANDS: Record<string, Handler> = {
  env: env.run,
  db: db.run,
  services: services.run,
  token: token.run,
  r2: r2.run,
  queue: queue.run,
  deploy: runDeploy,
  logs: runLogs,
  gym: gym.run,
  admin: admin.run,
};

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...tail] = argv;
  const parsed = parseArgs(tail);
  const pretty = boolFlag(parsed.flags, 'pretty');

  if (!command || command === '--help' || command === 'help' || boolFlag(parsed.flags, 'help')) {
    process.stdout.write(`${HELP}\n`);
    return command ? 0 : 1;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    printError(
      { ok: false, error: `Unknown command '${command}'`, code: 'UNKNOWN_COMMAND' },
      pretty,
    );
    return 1;
  }

  try {
    const result = await handler(parsed);
    printResult(result.data, pretty);
    return result.exitCode ?? 0;
  } catch (err) {
    if (err instanceof CommandError) {
      printError(err.payload, pretty);
      return err.exitCode;
    }
    printError(
      { ok: false, error: err instanceof Error ? err.message : String(err), code: 'UNEXPECTED' },
      pretty,
    );
    return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`${String(err)}\n`);
    process.exitCode = 1;
  });
