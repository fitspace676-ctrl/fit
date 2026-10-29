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
  AdminBlogPost,
  AdminBlogPostListResponse,
  AdminGymDetail,
  BlogAuthor,
  BlogAuthorListResponse,
  BlogCategory,
  BlogCategoryListResponse,
  CreateBlogAuthorBody,
  CreateBlogCategoryBody,
  CreateBlogPostInput,
  CreateBlogUploadBody,
  ListAdminBlogPostsQuery,
  UpdateBlogAuthorBody,
  UpdateBlogCategoryBody,
  UpdateBlogPostInput,
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
    const body = (await res.json()) as { code?: string; message?: string | string[] };
    // Validation failures carry a list of `field: message` lines, not a code.
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    code = body.code ?? message ?? code;
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

// --- Platform blog ----------------------------------------------------------
//
// FormaCore's own blog on formacore.io. Platform-level, so these endpoints take
// no gym: the API answers them for SUPER_ADMIN only.

/** A presigned PUT under `platform/blog/`, as `POST /admin/blog/uploads` answers it. */
export interface SignedUpload {
  key: string;
  url: string;
  method: 'PUT';
  contentType: string;
  contentLength: number;
  expiresIn: number;
  /** `null` when the API has no `R2_PUBLIC_URL` configured. */
  publicUrl: string | null;
}

/** A JSON request against the API with the operator's token. */
async function send(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(await authHeaders()),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
}

/** Like {@link unwrap}, for endpoints answering `204 No Content`. */
async function unwrapEmpty(res: Response): Promise<void> {
  if (res.ok) return;
  await unwrap<never>(res);
}

const id = (value: string) => encodeURIComponent(value);

/** `GET /admin/blog/posts` — one page, newest edit first. */
export async function fetchBlogPosts(
  query: Partial<ListAdminBlogPostsQuery>,
): Promise<AdminBlogPostListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  return unwrap(await send(`/admin/blog/posts?${params.toString()}`, 'GET'));
}

/** `GET /admin/blog/posts/:id`. */
export async function fetchBlogPost(postId: string): Promise<AdminBlogPost> {
  return unwrap(await send(`/admin/blog/posts/${id(postId)}`, 'GET'));
}

/** `POST /admin/blog/posts` — always created as a DRAFT. */
export async function createBlogPost(body: CreateBlogPostInput): Promise<AdminBlogPost> {
  return unwrap(await send('/admin/blog/posts', 'POST', body));
}

/** `PATCH /admin/blog/posts/:id`. */
export async function updateBlogPost(
  postId: string,
  body: UpdateBlogPostInput,
): Promise<AdminBlogPost> {
  return unwrap(await send(`/admin/blog/posts/${id(postId)}`, 'PATCH', body));
}

/** `DELETE /admin/blog/posts/:id`. */
export async function deleteBlogPost(postId: string): Promise<void> {
  return unwrapEmpty(await send(`/admin/blog/posts/${id(postId)}`, 'DELETE'));
}

/** `POST /admin/blog/posts/:id/publish` — no `publishAt` is now; a future one schedules. */
export async function publishBlogPost(postId: string, publishAt?: string): Promise<AdminBlogPost> {
  return unwrap(
    await send(`/admin/blog/posts/${id(postId)}/publish`, 'POST', publishAt ? { publishAt } : {}),
  );
}

/** `POST /admin/blog/posts/:id/unpublish` — back to a draft, schedule cleared. */
export async function unpublishBlogPost(postId: string): Promise<AdminBlogPost> {
  return unwrap(await send(`/admin/blog/posts/${id(postId)}/unpublish`, 'POST'));
}

/** `GET /admin/blog/categories`. */
export async function fetchBlogCategories(): Promise<BlogCategoryListResponse> {
  return unwrap(await send('/admin/blog/categories', 'GET'));
}

/** `POST /admin/blog/categories`. */
export async function createBlogCategory(body: CreateBlogCategoryBody): Promise<BlogCategory> {
  return unwrap(await send('/admin/blog/categories', 'POST', body));
}

/** `PATCH /admin/blog/categories/:id`. */
export async function updateBlogCategory(
  categoryId: string,
  body: UpdateBlogCategoryBody,
): Promise<BlogCategory> {
  return unwrap(await send(`/admin/blog/categories/${id(categoryId)}`, 'PATCH', body));
}

/** `DELETE /admin/blog/categories/:id`. */
export async function deleteBlogCategory(categoryId: string): Promise<void> {
  return unwrapEmpty(await send(`/admin/blog/categories/${id(categoryId)}`, 'DELETE'));
}

/** `GET /admin/blog/authors`. */
export async function fetchBlogAuthors(): Promise<BlogAuthorListResponse> {
  return unwrap(await send('/admin/blog/authors', 'GET'));
}

/** `POST /admin/blog/authors`. */
export async function createBlogAuthor(body: CreateBlogAuthorBody): Promise<BlogAuthor> {
  return unwrap(await send('/admin/blog/authors', 'POST', body));
}

/** `PATCH /admin/blog/authors/:id`. */
export async function updateBlogAuthor(
  authorId: string,
  body: UpdateBlogAuthorBody,
): Promise<BlogAuthor> {
  return unwrap(await send(`/admin/blog/authors/${id(authorId)}`, 'PATCH', body));
}

/** `DELETE /admin/blog/authors/:id`. */
export async function deleteBlogAuthor(authorId: string): Promise<void> {
  return unwrapEmpty(await send(`/admin/blog/authors/${id(authorId)}`, 'DELETE'));
}

/** `POST /admin/blog/uploads` — a presigned PUT for one blog image. */
export async function createBlogUpload(body: CreateBlogUploadBody): Promise<SignedUpload> {
  return unwrap(await send('/admin/blog/uploads', 'POST', body));
}
