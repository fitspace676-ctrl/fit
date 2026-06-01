import { connect } from 'node:net';

/** Reachability outcome for a single dependency. */
export type ReachableStatus = 'ok' | 'error';

export interface ProbeResult {
  status: ReachableStatus;
  /** Round-trip latency in ms when reachable. */
  latencyMs?: number;
  /** Failure reason when unreachable. */
  error?: string;
}

/**
 * Parse host/port out of a connection URL (postgres / redis / http). Falls back
 * to the protocol's default port when the URL omits one.
 */
export function hostPortFromUrl(url: string): { host: string; port: number } | undefined {
  try {
    const parsed = new URL(url);
    const defaults: Record<string, number> = {
      'postgres:': 5432,
      'postgresql:': 5432,
      'redis:': 6379,
      'rediss:': 6380,
      'http:': 80,
      'https:': 443,
    };
    const port = parsed.port ? Number(parsed.port) : defaults[parsed.protocol];
    if (!parsed.hostname || !port) return undefined;
    return { host: parsed.hostname, port };
  } catch {
    return undefined;
  }
}

/**
 * Open a raw TCP connection to `host:port` and immediately close it — enough to
 * confirm Postgres / Redis are accepting connections without pulling in their
 * client libraries. Resolves (never rejects) with a structured result.
 */
export function probeTcp(host: string, port: number, timeoutMs = 3000): Promise<ProbeResult> {
  return new Promise<ProbeResult>((resolvePromise) => {
    const start = Date.now();
    const socket = connect({ host, port });
    let settled = false;

    const finish = (result: ProbeResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ status: 'ok', latencyMs: Date.now() - start }));
    socket.once('timeout', () =>
      finish({ status: 'error', error: `timed out after ${timeoutMs}ms` }),
    );
    socket.once('error', (err) => finish({ status: 'error', error: err.message }));
  });
}

/**
 * Probe an HTTP(S) endpoint with a short timeout. Any response (even a 4xx/5xx)
 * counts as reachable — we're checking the service is up, not asserting on its
 * body. Resolves (never rejects) with a structured result.
 */
export async function probeHttp(url: string, timeoutMs = 5000): Promise<ProbeResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    return {
      status: res.ok ? 'ok' : 'error',
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
