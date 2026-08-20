// @fit/superadmin — server-side @fit/api client for the operator console.
//
// A thin typed wrapper over the cross-tenant `/admin/gyms` endpoints. Runs only
// on the server (Server Components + Server Actions): it reads the operator's
// `opsAccessToken` cookie via `next/headers` and forwards it as a Bearer token,
// so the API's `TenantGuard` sees the same SUPER_ADMIN the middleware already
// verified. Never import this from a Client Component — the cookie is httpOnly
// and the token must never reach the browser bundle.

import { cookies } from 'next/headers';
import type {
  AdminGymDetail,
  ListAdminAuditLogQuery,
  ListAdminAuditLogResponse,
  CreateAdminGymInput,
  CreateAdminGymResponse,
  GymStatus,
  ImpersonateResponse,
  ListAdminGymsResponse,
  UpdateGymStatusResponse,
} from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

/** Base URL of the @fit/api backend. Defaults to the local dev API. */
function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

/** Build the auth header forwarding the operator's session token to the API. */
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

/** `GET /admin/gyms` — the platform-wide roster with status, members, and owner. */
export async function fetchGyms(): Promise<ListAdminGymsResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/gyms`, {
    headers: await authHeaders(),
    // Always reflect the live roster — never serve a stale operator view.
    cache: 'no-store',
  });
  return unwrap<ListAdminGymsResponse>(res);
}

/** `GET /admin/gyms/:id` — one gym with its owner, staff, and counts. */
export async function fetchGym(id: string): Promise<AdminGymDetail> {
  const res = await fetch(`${apiBaseUrl()}/admin/gyms/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<AdminGymDetail>(res);
}

/** `POST /admin/gyms` — provision a gym and onboard its first owner. */
export async function createGym(input: CreateAdminGymInput): Promise<CreateAdminGymResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/gyms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreateAdminGymResponse>(res);
}

/** `PATCH /admin/gyms/:id/status` — suspend or reactivate a gym. */
export async function setGymStatus(
  id: string,
  status: GymStatus,
): Promise<UpdateGymStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/gyms/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ status }),
    cache: 'no-store',
  });
  return unwrap<UpdateGymStatusResponse>(res);
}

/**
 * `POST /admin/gyms/:id/impersonate` — an audited, single-use handoff code.
 *
 * The response carries no token: the code is redeemed on the gym's own host, by
 * that console's server, which is what keeps a live session out of the URL bar.
 */
export async function impersonateGym(id: string): Promise<ImpersonateResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/gyms/${encodeURIComponent(id)}/impersonate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ImpersonateResponse>(res);
}

/**
 * `GET /admin/audit-logs` — one page of the platform-wide trail.
 *
 * Every filter is server-side: the trail grows without bound, so the console
 * never holds more than the page it is showing.
 */
export async function fetchAuditLogs(
  query: Partial<ListAdminAuditLogQuery>,
): Promise<ListAdminAuditLogResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }

  const res = await fetch(`${apiBaseUrl()}/admin/audit-logs?${params.toString()}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAdminAuditLogResponse>(res);
}
