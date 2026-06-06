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
  CreateLocationData,
  CreateLocationResponse,
  DashboardStatsResponse,
  CreateMemberInput,
  CreateMemberResponse,
  CreateTrainerData,
  CreateTrainerResponse,
  ListAuditLogQuery,
  ListAuditLogResponse,
  GetGymSettingsResponse,
  UpdateGymSettingsInput,
  UpdateGymSettingsResponse,
  UploadGymLogoInput,
  UploadGymLogoResponse,
  GetAdminLocationResponse,
  GetAdminTrainerResponse,
  GetMemberResponse,
  ListAdminLocationsQuery,
  ListAdminLocationsResponse,
  ListAdminTrainersQuery,
  ListAdminTrainersResponse,
  ListMembersQuery,
  ListMembersResponse,
  ListAdminProductsQuery,
  ListAdminProductsResponse,
  CreateProductData,
  CreateProductResponse,
  GetAdminProductResponse,
  ListAdminPackagePlansQuery,
  ListAdminPackagePlansResponse,
  CreatePackagePlanData,
  CreatePackagePlanResponse,
  GetAdminPackagePlanResponse,
  SetPackagePlanStatusResponse,
  UpdatePackagePlanData,
  UpdatePackagePlanResponse,
  ListAdminClassTemplatesQuery,
  ListAdminClassTemplatesResponse,
  CreateClassTemplateData,
  CreateClassTemplateResponse,
  GetAdminClassTemplateResponse,
  SetClassTemplateStatusResponse,
  UpdateClassTemplateData,
  UpdateClassTemplateResponse,
  InviteStaffInput,
  InviteStaffResponse,
  ListStaffResponse,
  UpdateStaffRoleInput,
  UpdateStaffRoleResponse,
  SetLocationStatusResponse,
  SetMemberStatusResponse,
  SetProductStatusResponse,
  SetTrainerStatusResponse,
  UpdateLocationData,
  UpdateLocationResponse,
  UpdateMemberInput,
  UpdateMemberResponse,
  UpdateProductData,
  UpdateProductResponse,
  UpdateTrainerData,
  UpdateTrainerResponse,
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

/** `POST /members` — create a member; returns the new member's detail. */
export async function createMember(input: CreateMemberInput): Promise<CreateMemberResponse> {
  const res = await fetch(`${apiBaseUrl()}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreateMemberResponse>(res);
}

/** `PATCH /members/:id` — edit a member's profile; returns the updated detail. */
export async function updateMember(
  id: string,
  input: UpdateMemberInput,
): Promise<UpdateMemberResponse> {
  const res = await fetch(`${apiBaseUrl()}/members/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UpdateMemberResponse>(res);
}

/** `POST /members/:id/deactivate` — set the member's status to `SUSPENDED`. */
export async function deactivateMember(id: string): Promise<SetMemberStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/members/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetMemberStatusResponse>(res);
}

/** `POST /members/:id/reactivate` — set the member's status back to `ACTIVE`. */
export async function reactivateMember(id: string): Promise<SetMemberStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/members/${encodeURIComponent(id)}/reactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetMemberStatusResponse>(res);
}

// ── Trainers (T4.4) ─────────────────────────────────────────────────────────

/**
 * Serialise a trainer roster query to a `?key=value` string, dropping empty
 * values so a bare list carries no noise. The API re-coerces and re-validates
 * with the same Zod schema.
 */
export function trainersQueryString(query: Partial<ListAdminTrainersQuery>): string {
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

/** `GET /admin/trainers` — one filtered, server-paginated page of the gym's trainers. */
export async function fetchTrainers(
  query: Partial<ListAdminTrainersQuery> = {},
): Promise<ListAdminTrainersResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/trainers${trainersQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAdminTrainersResponse>(res);
}

/** `GET /admin/trainers/:id` — one trainer's detail. */
export async function fetchTrainer(id: string): Promise<GetAdminTrainerResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/trainers/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetAdminTrainerResponse>(res);
}

/** `POST /admin/trainers` — create a trainer; returns the new trainer's detail. */
export async function createTrainer(input: CreateTrainerData): Promise<CreateTrainerResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/trainers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreateTrainerResponse>(res);
}

/** `PATCH /admin/trainers/:id` — edit a trainer's profile; returns the updated detail. */
export async function updateTrainer(
  id: string,
  input: UpdateTrainerData,
): Promise<UpdateTrainerResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/trainers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UpdateTrainerResponse>(res);
}

/** `POST /admin/trainers/:id/deactivate` — set the trainer's status to `INACTIVE`. */
export async function deactivateTrainer(id: string): Promise<SetTrainerStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/trainers/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetTrainerStatusResponse>(res);
}

/** `POST /admin/trainers/:id/reactivate` — set the trainer's status back to `ACTIVE`. */
export async function reactivateTrainer(id: string): Promise<SetTrainerStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/trainers/${encodeURIComponent(id)}/reactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetTrainerStatusResponse>(res);
}

// ── Locations (T4.5) ─────────────────────────────────────────────────────────

/**
 * Serialise a location roster query to a `?key=value` string, dropping empty
 * values so a bare list carries no noise. The API re-coerces and re-validates
 * with the same Zod schema.
 */
export function locationsQueryString(query: Partial<ListAdminLocationsQuery>): string {
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

/** `GET /admin/locations` — one filtered, server-paginated page of the gym's locations. */
export async function fetchLocations(
  query: Partial<ListAdminLocationsQuery> = {},
): Promise<ListAdminLocationsResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/locations${locationsQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAdminLocationsResponse>(res);
}

/** `GET /admin/locations/:id` — one location's detail. */
export async function fetchLocation(id: string): Promise<GetAdminLocationResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/locations/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetAdminLocationResponse>(res);
}

/** `POST /admin/locations` — create a location; returns the new location's detail. */
export async function createLocation(input: CreateLocationData): Promise<CreateLocationResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/locations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreateLocationResponse>(res);
}

/** `PATCH /admin/locations/:id` — edit a location's profile; returns the updated detail. */
export async function updateLocation(
  id: string,
  input: UpdateLocationData,
): Promise<UpdateLocationResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/locations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UpdateLocationResponse>(res);
}

/** `POST /admin/locations/:id/deactivate` — set the location's status to `INACTIVE`. */
export async function deactivateLocation(id: string): Promise<SetLocationStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/locations/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetLocationStatusResponse>(res);
}

/** `POST /admin/locations/:id/reactivate` — set the location's status back to `ACTIVE`. */
export async function reactivateLocation(id: string): Promise<SetLocationStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/locations/${encodeURIComponent(id)}/reactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetLocationStatusResponse>(res);
}

// ── Products (T4.6) ───────────────────────────────────────────────────────────

/**
 * Serialise a product roster query to a `?key=value` string, dropping empty
 * values so a bare list carries no noise. The API re-coerces and re-validates
 * with the same Zod schema.
 */
export function productsQueryString(query: Partial<ListAdminProductsQuery>): string {
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

/** `GET /admin/products` — one filtered, server-paginated page of the gym's products. */
export async function fetchProducts(
  query: Partial<ListAdminProductsQuery> = {},
): Promise<ListAdminProductsResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/products${productsQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAdminProductsResponse>(res);
}

/** `GET /admin/products/:id` — one product's detail. */
export async function fetchProduct(id: string): Promise<GetAdminProductResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/products/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetAdminProductResponse>(res);
}

/** `POST /admin/products` — create a product; returns the new product's detail. */
export async function createProduct(input: CreateProductData): Promise<CreateProductResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/products`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreateProductResponse>(res);
}

/** `PATCH /admin/products/:id` — edit a product's profile; returns the updated detail. */
export async function updateProduct(
  id: string,
  input: UpdateProductData,
): Promise<UpdateProductResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UpdateProductResponse>(res);
}

/** `POST /admin/products/:id/deactivate` — set the product's status to `INACTIVE`. */
export async function deactivateProduct(id: string): Promise<SetProductStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/products/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetProductStatusResponse>(res);
}

/** `POST /admin/products/:id/reactivate` — set the product's status back to `ACTIVE`. */
export async function reactivateProduct(id: string): Promise<SetProductStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/products/${encodeURIComponent(id)}/reactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetProductStatusResponse>(res);
}

// ── Package plans (T4.11) ─────────────────────────────────────────────────────

/**
 * Serialise a package-plan roster query to a `?key=value` string, dropping empty
 * values so a bare list carries no noise. The API re-coerces and re-validates
 * with the same Zod schema.
 */
export function packagePlansQueryString(query: Partial<ListAdminPackagePlansQuery>): string {
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

/** `GET /admin/packages` — one filtered, server-paginated page of the gym's plans. */
export async function fetchPackagePlans(
  query: Partial<ListAdminPackagePlansQuery> = {},
): Promise<ListAdminPackagePlansResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/packages${packagePlansQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAdminPackagePlansResponse>(res);
}

/** `GET /admin/packages/:id` — one package plan's detail. */
export async function fetchPackagePlan(id: string): Promise<GetAdminPackagePlanResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/packages/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetAdminPackagePlanResponse>(res);
}

/** `POST /admin/packages` — create a package plan; returns the new plan's detail. */
export async function createPackagePlan(
  input: CreatePackagePlanData,
): Promise<CreatePackagePlanResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/packages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreatePackagePlanResponse>(res);
}

/** `PATCH /admin/packages/:id` — edit a package plan's profile; returns the updated detail. */
export async function updatePackagePlan(
  id: string,
  input: UpdatePackagePlanData,
): Promise<UpdatePackagePlanResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/packages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UpdatePackagePlanResponse>(res);
}

/** `POST /admin/packages/:id/deactivate` — set the plan's status to `INACTIVE`. */
export async function deactivatePackagePlan(id: string): Promise<SetPackagePlanStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/packages/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetPackagePlanStatusResponse>(res);
}

/** `POST /admin/packages/:id/reactivate` — set the plan's status back to `ACTIVE`. */
export async function reactivatePackagePlan(id: string): Promise<SetPackagePlanStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/packages/${encodeURIComponent(id)}/reactivate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetPackagePlanStatusResponse>(res);
}

// ── Class templates (T5.2) ────────────────────────────────────────────────────

/**
 * Serialise a class-template roster query to a `?key=value` string, dropping empty
 * values so a bare list carries no noise. The API re-coerces and re-validates with
 * the same Zod schema.
 */
export function classTemplatesQueryString(query: Partial<ListAdminClassTemplatesQuery>): string {
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

/** `GET /admin/classes` — one filtered, server-paginated page of the gym's class templates. */
export async function fetchClassTemplates(
  query: Partial<ListAdminClassTemplatesQuery> = {},
): Promise<ListAdminClassTemplatesResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/classes${classTemplatesQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAdminClassTemplatesResponse>(res);
}

/** `GET /admin/classes/:id` — one class template's detail. */
export async function fetchClassTemplate(id: string): Promise<GetAdminClassTemplateResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/classes/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetAdminClassTemplateResponse>(res);
}

/** `POST /admin/classes` — create a class template; returns the new template's detail. */
export async function createClassTemplate(
  input: CreateClassTemplateData,
): Promise<CreateClassTemplateResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/classes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreateClassTemplateResponse>(res);
}

/** `PATCH /admin/classes/:id` — edit a class template's profile; returns the updated detail. */
export async function updateClassTemplate(
  id: string,
  input: UpdateClassTemplateData,
): Promise<UpdateClassTemplateResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/classes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UpdateClassTemplateResponse>(res);
}

/** `POST /admin/classes/:id/pause` — set the template's status to `PAUSED`. */
export async function pauseClassTemplate(id: string): Promise<SetClassTemplateStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/classes/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetClassTemplateStatusResponse>(res);
}

/** `POST /admin/classes/:id/resume` — set the template's status back to `ACTIVE`. */
export async function resumeClassTemplate(id: string): Promise<SetClassTemplateStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/classes/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetClassTemplateStatusResponse>(res);
}

// ── Staff (T4.7) ──────────────────────────────────────────────────────────────

/** `GET /staff` — the gym's active staff plus its pending invitations. */
export async function fetchStaff(): Promise<ListStaffResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListStaffResponse>(res);
}

/** `POST /staff/invite` — invite someone to the gym's staff; returns the invite id. */
export async function inviteStaff(input: InviteStaffInput): Promise<InviteStaffResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/invite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<InviteStaffResponse>(res);
}

/** `DELETE /staff/invite/:inviteId` — revoke a pending invitation. */
export async function revokeStaffInvite(inviteId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/staff/invite/${encodeURIComponent(inviteId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<void>(res);
  }
}

/** `PATCH /staff/:memberId/role` — change a staff member's role; returns the updated row. */
export async function updateStaffRole(
  memberId: string,
  input: UpdateStaffRoleInput,
): Promise<UpdateStaffRoleResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(memberId)}/role`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UpdateStaffRoleResponse>(res);
}

/** `DELETE /staff/:memberId` — remove a staff member (revoking their sessions). */
export async function removeStaff(memberId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(memberId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<void>(res);
  }
}

// ── Gym settings (T4.8) ─────────────────────────────────────────────────────

/** `GET /gyms/settings` — the gym's brand / locale / hours / notification settings. */
export async function fetchGymSettings(): Promise<GetGymSettingsResponse> {
  const res = await fetch(`${apiBaseUrl()}/gyms/settings`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetGymSettingsResponse>(res);
}

/** `PATCH /gyms/settings` — partial update of the gym's settings; returns the full updated set. */
export async function updateGymSettings(
  input: UpdateGymSettingsInput,
): Promise<UpdateGymSettingsResponse> {
  const res = await fetch(`${apiBaseUrl()}/gyms/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UpdateGymSettingsResponse>(res);
}

/** `POST /gyms/settings/logo` — finalise a logo upload by its R2 key; returns its public URL. */
export async function uploadGymLogo(input: UploadGymLogoInput): Promise<UploadGymLogoResponse> {
  const res = await fetch(`${apiBaseUrl()}/gyms/settings/logo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UploadGymLogoResponse>(res);
}

// ── Audit log (T4.9) ──────────────────────────────────────────────────────────

/**
 * Serialise an audit-log query to a `?key=value` string, dropping `undefined` /
 * empty values so a bare list (`GET /audit-logs`) carries no noise. The API
 * re-coerces and re-validates with the same Zod schema.
 */
export function auditLogQueryString(query: Partial<ListAuditLogQuery>): string {
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

/** `GET /audit-logs` — one filtered, server-paginated page of the gym's audit trail. */
export async function fetchAuditLogs(
  query: Partial<ListAuditLogQuery> = {},
): Promise<ListAuditLogResponse> {
  const res = await fetch(`${apiBaseUrl()}/audit-logs${auditLogQueryString(query)}`, {
    headers: await authHeaders(),
    // Always reflect the live trail — never serve a stale audit view.
    cache: 'no-store',
  });
  return unwrap<ListAuditLogResponse>(res);
}

// ── Dashboard (T4.10) ─────────────────────────────────────────────────────────

/** `GET /dashboard/stats` — one live snapshot of the gym's KPI counts. */
export async function fetchDashboardStats(): Promise<DashboardStatsResponse> {
  const res = await fetch(`${apiBaseUrl()}/dashboard/stats`, {
    headers: await authHeaders(),
    // The dashboard reflects live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardStatsResponse>(res);
}

// ── Uploads (R2 presigned) ──────────────────────────────────────────────────

/** Body the admin sends to mint a presigned upload URL (gym comes from the session). */
export interface CreateUploadInput {
  contentType: string;
  contentLength: number;
  /** Key segment grouping the object, e.g. `trainers`. Must be lowercase letters. */
  entity: string;
  fileName?: string;
}

/** The presigned upload the API returns — `PUT` the bytes to `url`, then store `publicUrl`. */
export interface SignedUploadResponse {
  key: string;
  url: string;
  method: 'PUT';
  contentType: string;
  contentLength: number;
  expiresIn: number;
  publicUrl: string | null;
}

/**
 * `POST /uploads` — mint a short-lived presigned R2 `PUT` URL the browser uploads
 * the file bytes straight to. Tenant-scoped and gated by `MemberWrite` API-side;
 * returns `503` (surfaced as an {@link ApiError}) when R2 isn't configured.
 */
export async function createUpload(input: CreateUploadInput): Promise<SignedUploadResponse> {
  const res = await fetch(`${apiBaseUrl()}/uploads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<SignedUploadResponse>(res);
}
