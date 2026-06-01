import type { InfraEnv } from '@fit/env';
import type { ParsedArgs } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';
import { hostPortFromUrl, probeHttp, probeTcp, type ProbeResult } from '../util/net';

const USAGE = 'usage: fit services <status|health>';

export type ServiceName = 'postgres' | 'redis' | 'api' | 'r2';

export interface ServicesReport {
  postgres: ProbeResult;
  redis: ProbeResult;
  api: ProbeResult;
  r2: ProbeResult;
}

/** True only when every probed service reports `ok`. */
export function isHealthy(report: ServicesReport): boolean {
  return (Object.values(report) as ProbeResult[]).every((r) => r.status === 'ok');
}

async function probeUrlTcp(url: string | undefined): Promise<ProbeResult> {
  if (!url) return { status: 'error', error: 'not configured' };
  const target = hostPortFromUrl(url);
  if (!target) return { status: 'error', error: `unparseable URL` };
  return probeTcp(target.host, target.port);
}

/**
 * Probe every infra dependency concurrently: Postgres + Redis via a raw TCP
 * connect (no client libraries needed), the API via `GET /health`, and R2 by
 * hitting its public base URL when configured. Pure-ish: takes the resolved
 * env so it can be exercised without touching `process.env`.
 */
export async function buildReport(env: InfraEnv): Promise<ServicesReport> {
  const r2Target =
    env.R2_PUBLIC_URL ??
    (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

  const [postgres, redis, api, r2] = await Promise.all([
    probeUrlTcp(env.DATABASE_URL),
    probeUrlTcp(env.REDIS_URL),
    probeHttp(`${env.API_URL.replace(/\/$/, '')}/health`),
    r2Target
      ? probeHttp(r2Target)
      : Promise.resolve<ProbeResult>({ status: 'error', error: 'R2 not configured' }),
  ]);

  return { postgres, redis, api, r2 };
}

export async function run(args: ParsedArgs): Promise<CommandResult> {
  const [sub] = args.positionals;
  if (sub !== 'status' && sub !== 'health') {
    throw new CommandError(`Unknown 'services' subcommand '${sub ?? ''}'`, {
      code: 'BAD_ARGUMENT',
      detail: USAGE,
    });
  }

  const env = loadInfraEnv('local');
  const report = await buildReport(env);
  const healthy = isHealthy(report);

  // `status` always exits 0 (it's a report); `health` exits non-zero when any
  // dependency is down so scripts and CI can gate on it.
  const exitCode = sub === 'health' && !healthy ? 1 : 0;
  return { data: { healthy, services: report }, exitCode };
}
