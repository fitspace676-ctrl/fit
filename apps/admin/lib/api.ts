// @fit/admin — server-side @fit/api client for the staff console.
//
// Thin typed wrapper over the tenant-scoped `/members` endpoints. Runs only on
// the server (Server Components + Server Actions): it reads the staff member's
// `accessToken` cookie via `next/headers` and forwards it as a Bearer token, so
// the API's `TenantGuard` + `PermissionsGuard` see the same session the
// middleware already verified, and every query is auto-scoped to the token's gym.
// Never import this from a Client Component — the cookie is httpOnly and the
// token must never reach the browser bundle.

import { cookies } from 'next/headers';
import type {
  BulkExportMembersInput,
  BulkExportMembersResponse,
  GetMemberResponse,
  ListMembersQuery,
  ListMembersResponse,
} from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

/** Base URL of the @fit/api backend. Defaults to the local dev API. */
function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

/** Build the auth header forwarding the staff session token to the API. */
async function authHeaders(): Promise<Record<string, string>> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Raised when the API answers a non-2xx; carries the status for the caller. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Parse a response or throw an {@link ApiError} carrying the API's error code. */
async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }
  let code = `HTTP_${res.status}`;
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    code = body.code ?? body.message ?? code;
  } catch {
    // Non-JSON error body — keep the synthetic code.
  }
  throw new ApiError(res.status, code);
}

/**
 * Serialise a roster query to a `?key=value` string, dropping `undefined` and
 * empty values so a bare list (`GET /members`) carries no noise. Numbers are
 * stringified; the API re-coerces and re-validates with the same Zod schema.
 */
export function membersQueryString(query: Partial<ListMembersQuery>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** `GET /members` — one filtered, server-paginated page of the gym's members. */
export async function fetchMembers(
  query: Partial<ListMembersQuery> = {},
): Promise<ListMembersResponse> {
  const res = await fetch(`${apiBaseUrl()}/members${membersQueryString(query)}`, {
    headers: await authHeaders(),
    // Always reflect the live roster — never serve a stale staff view.
    cache: 'no-store',
  });
  return unwrap<ListMembersResponse>(res);
}

/** `GET /members/:id` — one member's detail (overview + history tabs). */
export async function fetchMember(id: string): Promise<GetMemberResponse> {
  const res = await fetch(`${apiBaseUrl()}/members/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetMemberResponse>(res);
}

/** `POST /members/bulk-export` — enqueue an async CSV export; returns the job handle. */
export async function bulkExportMembers(
  input: BulkExportMembersInput,
): Promise<BulkExportMembersResponse> {
  const res = await fetch(`${apiBaseUrl()}/members/bulk-export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<BulkExportMembersResponse>(res);
}
