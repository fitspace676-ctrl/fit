// @fit/admin — token-authenticated @fit/api client for the AI agent's MCP tools.
//
// Mirrors `lib/api.ts` but takes the operator's access token explicitly instead
// of reading the httpOnly cookie, so the MCP server can call the same
// tenant-scoped endpoints the console uses. Every call forwards the token as a
// Bearer, so the API's TenantGuard + PermissionsGuard see the operator's real
// session and auto-scope the query to their gym — the agent can never exceed
// what the operator themselves may read or edit.

/** Base URL of the @fit/api backend (same default as the console client). */
function apiBaseUrl(): string {
  return process.env.FIT_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

export interface FitApiClient {
  get(path: string): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  patch(path: string, body: unknown): Promise<unknown>;
  put(path: string, body: unknown): Promise<unknown>;
  del(path: string): Promise<unknown>;
}

/** A non-2xx from the API, carrying the status + the API's error code for the agent. */
export class FitApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
    this.name = 'FitApiError';
  }
}

async function unwrap(res: Response): Promise<unknown> {
  if (res.ok) {
    // 204s (status changes) carry no body.
    if (res.status === 204) return { ok: true };
    return res.json();
  }
  let code = `HTTP_${res.status}`;
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    code = body.code ?? body.message ?? code;
  } catch {
    // Non-JSON error body — keep the synthetic code.
  }
  throw new FitApiError(res.status, code);
}

/** Build a client bound to one operator's access token. */
export function createFitApiClient(token: string): FitApiClient {
  const base = apiBaseUrl();
  const auth = { authorization: `Bearer ${token}` };
  return {
    async get(path) {
      return unwrap(await fetch(`${base}${path}`, { headers: auth }));
    },
    async post(path, body) {
      return unwrap(
        await fetch(`${base}${path}`, {
          method: 'POST',
          headers: body === undefined ? auth : { 'content-type': 'application/json', ...auth },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
    },
    async patch(path, body) {
      return unwrap(
        await fetch(`${base}${path}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', ...auth },
          body: JSON.stringify(body),
        }),
      );
    },
    async put(path, body) {
      return unwrap(
        await fetch(`${base}${path}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', ...auth },
          body: JSON.stringify(body),
        }),
      );
    },
    async del(path) {
      return unwrap(await fetch(`${base}${path}`, { method: 'DELETE', headers: auth }));
    },
  };
}

/** Serialize a query object to `?k=v`, dropping empty values (API re-validates). */
export function qs(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      if (value !== '') params.set(key, value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      params.set(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}
