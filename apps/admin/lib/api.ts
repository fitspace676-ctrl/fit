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
  DashboardOverviewResponse,
  DashboardRange,
  AdminAnalyticsResponse,
  AnalyticsRange,
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
  ListLowStockResponse,
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
  ListAdminSubscriptionPlansQuery,
  ListAdminSubscriptionPlansResponse,
  CreateSubscriptionPlanData,
  CreateSubscriptionPlanResponse,
  GetAdminSubscriptionPlanResponse,
  SetSubscriptionPlanStatusResponse,
  UpdateSubscriptionPlanData,
  UpdateSubscriptionPlanResponse,
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
  SendReceiptInput,
  SendReceiptResponse,
  RecordPosSaleInput,
  RecordPosSaleResponse,
  CashReconciliationReport,
  ListOrdersQueryInput,
  ListOrdersResponse,
  AdminOrderDetail,
  RefundOrderInput,
  RefundOrderResponse,
  CheckInStatsResponse,
  TodayCheckInsResponse,
  RecordCheckInInput,
  RecordCheckInResponse,
  MemberEligibility,
  AdminScheduleQuery,
  AdminScheduleResponse,
  GetAdminClassInstanceResponse,
  CancelClassInstanceResponse,
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

/**
 * `GET /admin/products/low-stock` — the low-stock report: every active product
 * carrying a variant at or below `threshold` (omitted ⇒ the API's default), most
 * urgent first. Enforces `ProductRead` (the same capability the roster needs).
 */
export async function fetchLowStockProducts(threshold?: number): Promise<ListLowStockResponse> {
  const qs = threshold === undefined ? '' : `?threshold=${encodeURIComponent(threshold)}`;
  const res = await fetch(`${apiBaseUrl()}/admin/products/low-stock${qs}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListLowStockResponse>(res);
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

// ── Subscription plans (T8.2) ──────────────────────────────────────────────────

/**
 * Serialise a subscription-plan roster query to a `?key=value` string, dropping
 * empty values so a bare list carries no noise. The API re-coerces and
 * re-validates with the same Zod schema.
 */
export function subscriptionPlansQueryString(
  query: Partial<ListAdminSubscriptionPlansQuery>,
): string {
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

/** `GET /admin/subscriptions` — one filtered, server-paginated page of the gym's plans. */
export async function fetchSubscriptionPlans(
  query: Partial<ListAdminSubscriptionPlansQuery> = {},
): Promise<ListAdminSubscriptionPlansResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/subscriptions${subscriptionPlansQueryString(query)}`,
    {
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
  return unwrap<ListAdminSubscriptionPlansResponse>(res);
}

/** `GET /admin/subscriptions/:id` — one subscription plan's detail. */
export async function fetchSubscriptionPlan(id: string): Promise<GetAdminSubscriptionPlanResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/subscriptions/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetAdminSubscriptionPlanResponse>(res);
}

/** `POST /admin/subscriptions` — create a subscription plan; returns the new plan's detail. */
export async function createSubscriptionPlan(
  input: CreateSubscriptionPlanData,
): Promise<CreateSubscriptionPlanResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreateSubscriptionPlanResponse>(res);
}

/** `PATCH /admin/subscriptions/:id` — edit a subscription plan's profile; returns the updated detail. */
export async function updateSubscriptionPlan(
  id: string,
  input: UpdateSubscriptionPlanData,
): Promise<UpdateSubscriptionPlanResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/subscriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<UpdateSubscriptionPlanResponse>(res);
}

/** `POST /admin/subscriptions/:id/deactivate` — set the plan's status to `INACTIVE`. */
export async function deactivateSubscriptionPlan(
  id: string,
): Promise<SetSubscriptionPlanStatusResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/subscriptions/${encodeURIComponent(id)}/deactivate`,
    {
      method: 'POST',
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
  return unwrap<SetSubscriptionPlanStatusResponse>(res);
}

/** `POST /admin/subscriptions/:id/reactivate` — set the plan's status back to `ACTIVE`. */
export async function reactivateSubscriptionPlan(
  id: string,
): Promise<SetSubscriptionPlanStatusResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/subscriptions/${encodeURIComponent(id)}/reactivate`,
    {
      method: 'POST',
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
  return unwrap<SetSubscriptionPlanStatusResponse>(res);
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

/**
 * `GET /dashboard/overview?range=` — the FormaCore control-room overview (live
 * occupancy, today's KPIs, the range-windowed revenue series, plan mix, today's
 * schedule, real-event alerts, recent check-ins) for the caller's own gym. Gated
 * `ReportView` API-side. `range` defaults to `7d` when omitted; the API
 * re-validates it with the same Zod schema.
 */
export async function fetchDashboardOverview(
  range?: DashboardRange,
): Promise<DashboardOverviewResponse> {
  const qs = range ? `?range=${encodeURIComponent(range)}` : '';
  const res = await fetch(`${apiBaseUrl()}/dashboard/overview${qs}`, {
    headers: await authHeaders(),
    // The dashboard reflects live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardOverviewResponse>(res);
}

// ── Reception / check-in (T4.12) ──────────────────────────────────────────────

/** `GET /admin/check-ins/stats` — the reception KPI snapshot (today's figures). */
export async function fetchCheckInStats(): Promise<CheckInStatsResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/check-ins/stats`, {
    headers: await authHeaders(),
    // Reception reflects live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<CheckInStatsResponse>(res);
}

/** `GET /admin/check-ins/today` — today's arrivals, most recent first (live feed). */
export async function fetchTodayCheckIns(): Promise<TodayCheckInsResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/check-ins/today`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<TodayCheckInsResponse>(res);
}

/** `POST /admin/check-ins` — record a member's arrival; returns the row + eligibility. */
export async function recordCheckIn(input: RecordCheckInInput): Promise<RecordCheckInResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/check-ins`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<RecordCheckInResponse>(res);
}

/** `GET /admin/check-ins/eligibility?gymMemberId=` — one member's access standing + plan. */
export async function fetchMemberEligibility(gymMemberId: string): Promise<MemberEligibility> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/check-ins/eligibility?gymMemberId=${encodeURIComponent(gymMemberId)}`,
    {
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
  return unwrap<MemberEligibility>(res);
}

// ── Schedule week-view (T3.1 → T3.2) ──────────────────────────────────────────

/**
 * Serialise a schedule window query to a `?key=value` string, dropping empty
 * values so a bare window carries no filter noise. The API re-coerces and
 * re-validates with the same Zod schema (`adminScheduleQuerySchema`), so passing
 * the calendar's raw filter values is safe.
 */
export function scheduleQueryString(query: Partial<AdminScheduleQuery>): string {
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

/**
 * `GET /admin/schedule?from=&to=&trainerId=&locationId=` — the gym's class
 * occurrences whose `startsAt` falls in `[from, to)`, ordered by start, each with
 * its resolved occupancy, trainer, branch, and lifecycle status (T3.1). The
 * calendar issues this as staff page between weeks; an empty `instances` array is
 * a normal result the grid renders as its empty state.
 */
export async function fetchSchedule(query: AdminScheduleQuery): Promise<AdminScheduleResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/schedule${scheduleQueryString(query)}`, {
    headers: await authHeaders(),
    // The calendar reflects live tenant state — never serve a stale week.
    cache: 'no-store',
  });
  return unwrap<AdminScheduleResponse>(res);
}

/**
 * `GET /admin/schedule/instances/:id` — one occurrence in full for the schedule
 * drawer (T3.3): the calendar block plus its live booking roster and waitlist. A
 * `404 CLASS_INSTANCE_NOT_FOUND` for an unknown / cross-tenant id.
 */
export async function fetchScheduleInstance(id: string): Promise<GetAdminClassInstanceResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/schedule/instances/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    // Occupancy and roster reflect live tenant state — never serve stale.
    cache: 'no-store',
  });
  return unwrap<GetAdminClassInstanceResponse>(res);
}

/**
 * `POST /admin/schedule/instances/:id/cancel` — cancel a scheduled occurrence
 * (T3.3): releases every booking, refunds each held seat's class credit, and
 * returns the refreshed detail. Gated `ClassWrite` API-side; a completed /
 * already-canceled occurrence is a `409 CLASS_NOT_CANCELABLE`.
 */
export async function cancelScheduleInstance(id: string): Promise<CancelClassInstanceResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/schedule/instances/${encodeURIComponent(id)}/cancel`,
    {
      method: 'POST',
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
  return unwrap<CancelClassInstanceResponse>(res);
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/**
 * `GET /admin/analytics?range=` — one range-windowed analytics snapshot (KPIs,
 * revenue series, channel/plan mix, top classes) for the caller's own gym. Gated
 * `ReportView` API-side. `range` defaults to `30d` when omitted; the API
 * re-validates it with the same Zod schema.
 */
export async function fetchAnalytics(range?: AnalyticsRange): Promise<AdminAnalyticsResponse> {
  const qs = range ? `?range=${encodeURIComponent(range)}` : '';
  const res = await fetch(`${apiBaseUrl()}/admin/analytics${qs}`, {
    headers: await authHeaders(),
    // Analytics reflect live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<AdminAnalyticsResponse>(res);
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

/**
 * `POST /orders/receipt` — email a customer the receipt of a completed POS sale
 * (T7.4). Tenant-scoped and gated by `BillingRead` API-side. Returns
 * `{ delivered }` — `false` when email delivery is unconfigured and the receipt
 * was only logged server-side.
 */
export async function sendPosReceipt(input: SendReceiptInput): Promise<SendReceiptResponse> {
  const res = await fetch(`${apiBaseUrl()}/orders/receipt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<SendReceiptResponse>(res);
}

/**
 * `POST /orders/pos-sale` — persist a completed POS sale as a paid order + captured
 * payment (T7.5), so the day's takings exist to reconcile. Tenant-scoped and gated
 * by `BillingRead` API-side. Returns the created `{ orderId, paymentId }`.
 */
export async function recordPosSale(input: RecordPosSaleInput): Promise<RecordPosSaleResponse> {
  const res = await fetch(`${apiBaseUrl()}/orders/pos-sale`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<RecordPosSaleResponse>(res);
}

/**
 * `GET /orders/reconciliation?date=YYYY-MM-DD` — the end-of-day cash reconciliation
 * for one business day (T7.5): captured takings grouped by settlement method, with
 * the expected cash drawer. Tenant-scoped and gated by `BillingRead` API-side.
 */
export async function fetchCashReconciliation(date: string): Promise<CashReconciliationReport> {
  const res = await fetch(
    `${apiBaseUrl()}/orders/reconciliation?date=${encodeURIComponent(date)}`,
    {
      headers: await authHeaders(),
      // The report reflects the live day's takings — never serve a stale view.
      cache: 'no-store',
    },
  );
  return unwrap<CashReconciliationReport>(res);
}

// ── Order management (T7.9) ───────────────────────────────────────────────────

/**
 * Serialise an order roster query to a `?key=value` string, dropping empty values
 * so a bare list carries no noise. The API re-coerces and re-validates with the
 * same Zod schema, so passing the admin form's raw filter values is safe.
 */
export function ordersQueryString(query: Partial<ListOrdersQueryInput>): string {
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

/** `GET /orders` — one filtered, server-paginated page of the gym's orders. */
export async function fetchOrders(
  query: Partial<ListOrdersQueryInput> = {},
): Promise<ListOrdersResponse> {
  const res = await fetch(`${apiBaseUrl()}/orders${ordersQueryString(query)}`, {
    headers: await authHeaders(),
    // Always reflect the live order history — never serve a stale staff view.
    cache: 'no-store',
  });
  return unwrap<ListOrdersResponse>(res);
}

/** `GET /orders/:id` — one order's full detail (items, payments, refunds, timeline). */
export async function fetchOrder(id: string): Promise<AdminOrderDetail> {
  const res = await fetch(`${apiBaseUrl()}/orders/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<AdminOrderDetail>(res);
}

/**
 * `POST /orders/:id/refund` — refund part or all of an order's payment. Throws an
 * {@link ApiError} carrying `EXCEEDS_PAID_AMOUNT` (422) when the amount is too high,
 * which the refund form translates to a staff-facing message. Gated `BillingManage`.
 */
export async function refundOrder(
  id: string,
  input: RefundOrderInput,
): Promise<RefundOrderResponse> {
  const res = await fetch(`${apiBaseUrl()}/orders/${encodeURIComponent(id)}/refund`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<RefundOrderResponse>(res);
}

/**
 * `GET /orders/export` — the raw streaming CSV response, with the staff bearer
 * token forwarded. Returned as the live `Response` (not parsed) so the admin route
 * handler can pipe its body straight to the browser as a download. The query is
 * the same filter set the roster uses.
 */
export async function fetchOrdersExport(
  query: Partial<ListOrdersQueryInput> = {},
): Promise<Response> {
  return fetch(`${apiBaseUrl()}/orders/export${ordersQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
}
