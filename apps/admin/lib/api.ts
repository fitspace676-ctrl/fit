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
  DashboardSalesQuery,
  DashboardSalesResponse,
  DashboardClassesQuery,
  DashboardClassesResponse,
  DashboardStaffQuery,
  DashboardStaffResponse,
  DashboardMembersQuery,
  DashboardMembersResponse,
  DashboardRevenueQuery,
  DashboardRevenueResponse,
  DashboardPeriod,
  AdminAnalyticsResponse,
  AnalyticsRange,
  CreateMemberInput,
  CreateMemberNoteInput,
  CreateMemberResponse,
  CreateTrainerData,
  CreateTrainerResponse,
  ListActivityQuery,
  ListActivityResponse,
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
  ListEmailTemplatesResponse,
  EmailTemplateRow,
  UpdateEmailTemplateInput,
  ListOrdersQueryInput,
  ListOrdersResponse,
  AdminOrderDetail,
  InventoryQuery,
  ListInventoryResponse,
  ListStockMovementsQuery,
  ListStockMovementsResponse,
  AdjustStockInput,
  AdjustStockResponse,
  CreateProductData,
  CreateProductResponse,
  GetAdminProductResponse,
  ListAdminProductCategoriesResponse,
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
  ProductCategoryResponse,
  DeleteProductCategoryResponse,
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
  FreezeSubscriptionData,
  FreezeSubscriptionResponse,
  UnfreezeSubscriptionResponse,
  PurchaseCreditPackData,
  PurchaseCreditPackResponse,
  ListCreditPacksResponse,
  ListCreditPackCatalogueResponse,
  ListAdminClassTemplatesQuery,
  ListAdminClassTemplatesResponse,
  CreateClassTemplateData,
  CreateClassTemplateResponse,
  GetAdminClassTemplateResponse,
  SetClassTemplateStatusResponse,
  UpdateClassTemplateData,
  UpdateClassTemplateResponse,
  ListAdminClassTypesQuery,
  ListAdminClassTypesResponse,
  CreateClassTypeData,
  UpdateClassTypeData,
  AdminClassTypeDetail,
  AdminClassTypeOption,
  GetAdminClassTypeResponse,
  CreateStaffInput,
  InviteStaffInput,
  InviteStaffResponse,
  ListStaffResponse,
  StaffMember,
  UpdateStaffProfileInput,
  UpdateStaffRoleInput,
  UpdateStaffRoleResponse,
  ListStaffRolesResponse,
  ListStaffNotesResponse,
  StaffNoteRow,
  CreateStaffNoteInput,
  ListStaffTasksResponse,
  StaffTaskRow,
  CreateStaffTaskInput,
  UpdateStaffTaskInput,
  ListTimeOffResponse,
  TimeOffRequestRow,
  CreateTimeOffRequestInput,
  DecideTimeOffRequestInput,
  ListTimeOffQuery,
  StaffScheduleResponse,
  UpdateStaffScheduleInput,
  WorkingNowResponse,
  SetLocationStatusResponse,
  SetMemberStatusResponse,
  SendMemberEmailInput,
  SendMemberEmailResponse,
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
  ListAdminInvoicesQuery,
  ListAdminInvoicesResponse,
  CreateInvoiceData,
  CreateInvoiceResponse,
  SendInvoiceEmailResponse,
  CheckInStatsResponse,
  TodayCheckInsResponse,
  RecordCheckInInput,
  RecordCheckInResponse,
  MemberEligibility,
  AdminScheduleQuery,
  AdminScheduleResponse,
  GetAdminClassInstanceResponse,
  CancelClassInstanceResponse,
  PromoteWaitlistResponse,
  BookMemberOntoClassResponse,
  ListAdminPtSessionsQuery,
  AdminPtSessionsResponse,
  CreatePtSessionData,
  CreatePtSessionResponse,
  PtSessionStatusResponse,
  MarkAttendanceData,
  MarkAttendanceResponse,
  ReportCatalogResponse,
  ReportResult,
  ReportKey,
  ReportRange,
  ReportFormat,
  ReportDrilldown,
  ReportDrilldownRange,
  ReportMetric,
  ListAutomationRulesQuery,
  ListAutomationRulesResponse,
  ListAutomationTemplatesResponse,
  AutomationCatalogResponse,
  AutomationStats,
  GetAutomationRuleResponse,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  SaveAsTemplateInput,
  MarketingCatalogResponse,
  ListAudienceSegmentsResponse,
  AudienceSegmentRow,
  CreateAudienceSegmentInput,
  UpdateAudienceSegmentInput,
  AudiencePreviewResponse,
  AudienceCriteria,
  ListPromoCodesResponse,
  PromoCodeRow,
  CreatePromoCodeInput,
  UpdatePromoCodeInput,
  TogglePromoCodeInput,
  ListMessageTemplatesResponse,
  MessageTemplateRow,
  CreateMessageTemplateInput,
  UpdateMessageTemplateInput,
  ListCampaignsQuery,
  ListCampaignsResponse,
  GetCampaignResponse,
  CreateCampaignInput,
  UpdateCampaignInput,
  ScheduleCampaignInput,
  SaveCampaignAsTemplateInput,
  LoyaltyCatalogResponse,
  LoyaltyProgramResponse,
  UpdateLoyaltyProgramInput,
  ListLoyaltyRewardsResponse,
  LoyaltyRewardRow,
  CreateLoyaltyRewardInput,
  UpdateLoyaltyRewardInput,
  ListRedemptionsQuery,
  ListRedemptionsResponse,
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

/** `POST /members/:id/trash` — move the member to trash (soft-delete); returns its detail. */
export async function trashMember(id: string): Promise<SetMemberStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/members/${encodeURIComponent(id)}/trash`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetMemberStatusResponse>(res);
}

/** `POST /members/:id/restore` — restore a trashed member to the live roster; returns its detail. */
export async function restoreMember(id: string): Promise<SetMemberStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/members/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetMemberStatusResponse>(res);
}

/** `POST /members/:id/email` — send a one-off staff email to the member. */
export async function sendMemberEmail(
  id: string,
  input: SendMemberEmailInput,
): Promise<SendMemberEmailResponse> {
  const res = await fetch(`${apiBaseUrl()}/members/${encodeURIComponent(id)}/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<SendMemberEmailResponse>(res);
}

/** `POST /members/:id/notes` — add a staff note; returns the fresh member detail. */
export async function createMemberNote(
  id: string,
  input: CreateMemberNoteInput,
): Promise<GetMemberResponse> {
  const res = await fetch(`${apiBaseUrl()}/members/${encodeURIComponent(id)}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<GetMemberResponse>(res);
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

/**
 * `GET /admin/products/inventory` — every product flattened into its stock
 * positions with on-hand counts, plus totals across the whole filtered set.
 */
export async function fetchInventory(
  query: Partial<InventoryQuery> = {},
): Promise<ListInventoryResponse> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.tracked) params.set('tracked', 'true');
  const qs = params.toString();
  const res = await fetch(`${apiBaseUrl()}/admin/products/inventory${qs ? `?${qs}` : ''}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListInventoryResponse>(res);
}

/** `GET /admin/product-categories` — the gym's category shelves, by name. */
export async function fetchProductCategories(): Promise<ListAdminProductCategoriesResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/product-categories`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAdminProductCategoriesResponse>(res);
}

/** `POST /admin/product-categories` — create a category; `409` on a duplicate name. */
export async function createProductCategory(
  input: CreateProductCategoryInput,
): Promise<ProductCategoryResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/product-categories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<ProductCategoryResponse>(res);
}

/** `PATCH /admin/product-categories/:id` — rename a category. */
export async function renameProductCategory(
  id: string,
  input: UpdateProductCategoryInput,
): Promise<ProductCategoryResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/product-categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<ProductCategoryResponse>(res);
}

/**
 * `DELETE /admin/product-categories/:id` — delete a category. Its products are not
 * deleted; the response reports how many fell back to uncategorised.
 */
export async function deleteProductCategory(id: string): Promise<DeleteProductCategoryResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/product-categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<DeleteProductCategoryResponse>(res);
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

/**
 * `POST /admin/products/:id/stock` — move one stock position and record why.
 *
 * The write path for inventory, distinct from {@link updateProduct}: it applies
 * atomically against the count currently in the database, so two people
 * restocking at once compose instead of overwriting each other.
 */
export async function adjustProductStock(
  id: string,
  input: AdjustStockInput,
): Promise<AdjustStockResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/products/${encodeURIComponent(id)}/stock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<AdjustStockResponse>(res);
}

/** `GET /admin/products/:id/stock-movements` — that product's ledger, newest first. */
export async function fetchStockMovements(
  id: string,
  query: Partial<ListStockMovementsQuery> = {},
): Promise<ListStockMovementsResponse> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const qs = params.toString();
  const res = await fetch(
    `${apiBaseUrl()}/admin/products/${encodeURIComponent(id)}/stock-movements${qs ? `?${qs}` : ''}`,
    { headers: await authHeaders(), cache: 'no-store' },
  );
  return unwrap<ListStockMovementsResponse>(res);
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

/**
 * `POST /admin/subscriptions/:id/freeze` — pause a *member's* subscription from the
 * console. `id` is the subscription id (not a plan id); the body carries the
 * `startDate` + `durationDays`. Surfaces the API's `EXCEEDS_FREEZE_ALLOWANCE` etc.
 * as an {@link ApiError}.
 */
export async function freezeMemberSubscription(
  id: string,
  input: FreezeSubscriptionData,
): Promise<FreezeSubscriptionResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/subscriptions/${encodeURIComponent(id)}/freeze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<FreezeSubscriptionResponse>(res);
}

/** `POST /admin/subscriptions/:id/unfreeze` — resume a member's frozen subscription. */
export async function unfreezeMemberSubscription(
  id: string,
): Promise<UnfreezeSubscriptionResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/subscriptions/${encodeURIComponent(id)}/unfreeze`,
    {
      method: 'POST',
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
  return unwrap<UnfreezeSubscriptionResponse>(res);
}

// ── Credit packs (T5.8) ───────────────────────────────────────────────────────

/**
 * `GET /admin/members/:id/credit-packs` — a member's usable credit packs (the
 * remaining-balance display on the member-detail screen). An unknown member is a
 * `404 MEMBER_NOT_FOUND` surfaced as an {@link ApiError}.
 */
export async function fetchMemberCreditPacks(id: string): Promise<ListCreditPacksResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/members/${encodeURIComponent(id)}/credit-packs`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListCreditPacksResponse>(res);
}

/** `GET /admin/credit-packs/catalogue` — the gym's buyable credit packs, for the "Add credit" modal. */
export async function fetchCreditPackCatalogue(): Promise<ListCreditPackCatalogueResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/credit-packs/catalogue`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListCreditPackCatalogueResponse>(res);
}

/**
 * `POST /admin/members/:id/credit-packs` — sell / grant a credit pack (named by
 * `{ packId }`) to a member from the console. A plan that isn't a purchasable pack
 * is a `422 PACK_UNAVAILABLE`; an unknown member is a `404 MEMBER_NOT_FOUND`.
 */
export async function grantMemberCreditPack(
  id: string,
  input: PurchaseCreditPackData,
): Promise<PurchaseCreditPackResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/members/${encodeURIComponent(id)}/credit-packs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<PurchaseCreditPackResponse>(res);
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
/**
 * `DELETE /admin/classes/:id` — remove a class template. Occurrences that already
 * happened, and future ones a member booked, are detached by the API rather than
 * deleted, so the gym keeps its history.
 */
export async function deleteClassTemplate(id: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/admin/classes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  // A 204 carries no body; only a failure needs decoding for its message.
  if (!res.ok && res.status !== 204) {
    await unwrap<void>(res);
  }
}

export async function resumeClassTemplate(id: string): Promise<SetClassTemplateStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/classes/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SetClassTemplateStatusResponse>(res);
}

// ── Class types (the reusable catalogue the schedule places occurrences of) ────

/** Serialise a class-type roster query to a `?key=value` string, dropping empties. */
export function classTypesQueryString(query: Partial<ListAdminClassTypesQuery>): string {
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

/** `GET /admin/class-types` — one filtered, server-paginated page of the gym's class types. */
export async function fetchClassTypes(
  query: Partial<ListAdminClassTypesQuery> = {},
): Promise<ListAdminClassTypesResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/class-types${classTypesQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAdminClassTypesResponse>(res);
}

/** `GET /admin/class-types/options` — the gym's active types as scheduler options. */
export async function fetchClassTypeOptions(): Promise<AdminClassTypeOption[]> {
  const res = await fetch(`${apiBaseUrl()}/admin/class-types/options`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<AdminClassTypeOption[]>(res);
}

/** `GET /admin/class-types/:id` — one class type's detail. */
export async function fetchClassType(id: string): Promise<GetAdminClassTypeResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/class-types/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetAdminClassTypeResponse>(res);
}

/** `POST /admin/class-types` — create a class type; returns the new type's detail. */
export async function createClassType(input: CreateClassTypeData): Promise<AdminClassTypeDetail> {
  const res = await fetch(`${apiBaseUrl()}/admin/class-types`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<AdminClassTypeDetail>(res);
}

/** `PATCH /admin/class-types/:id` — edit a class type's profile; returns the updated detail. */
export async function updateClassType(
  id: string,
  input: UpdateClassTypeData,
): Promise<AdminClassTypeDetail> {
  const res = await fetch(`${apiBaseUrl()}/admin/class-types/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<AdminClassTypeDetail>(res);
}

/** `POST /admin/class-types/:id/deactivate` — soft-retire a class type. */
export async function deactivateClassType(id: string): Promise<AdminClassTypeDetail> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/class-types/${encodeURIComponent(id)}/deactivate`,
    {
      method: 'POST',
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
  return unwrap<AdminClassTypeDetail>(res);
}

/** `POST /admin/class-types/:id/activate` — reactivate a class type. */
export async function activateClassType(id: string): Promise<AdminClassTypeDetail> {
  const res = await fetch(`${apiBaseUrl()}/admin/class-types/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<AdminClassTypeDetail>(res);
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

/** `POST /staff` — add a login-less staff member straight to the directory. */
export async function createStaff(input: CreateStaffInput): Promise<StaffMember> {
  const res = await fetch(`${apiBaseUrl()}/staff`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<StaffMember>(res);
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

/** `PATCH /staff/:memberId/profile` — edit a directory staff member's profile. */
export async function updateStaffProfile(
  memberId: string,
  input: UpdateStaffProfileInput,
): Promise<StaffMember> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(memberId)}/profile`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<StaffMember>(res);
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

// ── Staff depth: roles / notes / tasks / time-off / schedule (T12.14) ──

/** `GET /staff/roles` — the read-only roles & permissions matrix. */
export async function fetchStaffRoles(): Promise<ListStaffRolesResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/roles`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListStaffRolesResponse>(res);
}

/** `GET /staff/:staffId/notes` — a staff member's internal notes, newest first. */
export async function fetchStaffNotes(staffId: string): Promise<ListStaffNotesResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(staffId)}/notes`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListStaffNotesResponse>(res);
}

/** `POST /staff/:staffId/notes` — log a note about a staff member. */
export async function createStaffNote(
  staffId: string,
  input: CreateStaffNoteInput,
): Promise<StaffNoteRow> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(staffId)}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<StaffNoteRow>(res);
}

/** `DELETE /staff/notes/:noteId` — delete a staff note. */
export async function deleteStaffNote(noteId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/staff/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<void>(res);
  }
}

/** `GET /staff/:staffId/tasks` — a staff member's assigned tasks. */
export async function fetchStaffTasks(staffId: string): Promise<ListStaffTasksResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(staffId)}/tasks`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListStaffTasksResponse>(res);
}

/** `POST /staff/:staffId/tasks` — assign a task to a staff member. */
export async function createStaffTask(
  staffId: string,
  input: CreateStaffTaskInput,
): Promise<StaffTaskRow> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(staffId)}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<StaffTaskRow>(res);
}

/** `PATCH /staff/tasks/:taskId` — edit a task or toggle its completion. */
export async function updateStaffTask(
  taskId: string,
  input: UpdateStaffTaskInput,
): Promise<StaffTaskRow> {
  const res = await fetch(`${apiBaseUrl()}/staff/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<StaffTaskRow>(res);
}

/** `DELETE /staff/tasks/:taskId` — delete an assigned task. */
export async function deleteStaffTask(taskId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/staff/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<void>(res);
  }
}

/** `GET /staff/time-off` — the gym-wide time-off queue, optionally filtered. */
export async function fetchTimeOff(
  query: Partial<ListTimeOffQuery> = {},
): Promise<ListTimeOffResponse> {
  const params = new URLSearchParams();
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.staffId) {
    params.set('staffId', query.staffId);
  }
  const qs = params.toString();
  const res = await fetch(`${apiBaseUrl()}/staff/time-off${qs ? `?${qs}` : ''}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListTimeOffResponse>(res);
}

/** `GET /staff/:staffId/time-off` — one staff member's time-off requests. */
export async function fetchStaffTimeOff(staffId: string): Promise<ListTimeOffResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(staffId)}/time-off`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListTimeOffResponse>(res);
}

/** `POST /staff/:staffId/time-off` — request time off for a staff member. */
export async function createTimeOff(
  staffId: string,
  input: CreateTimeOffRequestInput,
): Promise<TimeOffRequestRow> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(staffId)}/time-off`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<TimeOffRequestRow>(res);
}

/** `PATCH /staff/time-off/:requestId/decision` — approve or deny a request. */
export async function decideTimeOff(
  requestId: string,
  input: DecideTimeOffRequestInput,
): Promise<TimeOffRequestRow> {
  const res = await fetch(
    `${apiBaseUrl()}/staff/time-off/${encodeURIComponent(requestId)}/decision`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(input),
      cache: 'no-store',
    },
  );
  return unwrap<TimeOffRequestRow>(res);
}

/** `DELETE /staff/time-off/:requestId` — withdraw a time-off request. */
export async function deleteTimeOff(requestId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/staff/time-off/${encodeURIComponent(requestId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<void>(res);
  }
}

/** `GET /staff/:staffId/schedule` — a staff member's weekly shift schedule. */
export async function fetchStaffSchedule(staffId: string): Promise<StaffScheduleResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(staffId)}/schedule`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<StaffScheduleResponse>(res);
}

/** The gym's staff on shift right now — behind the "Who's Working Now" card. */
export async function fetchWorkingNow(): Promise<WorkingNowResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/working-now`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<WorkingNowResponse>(res);
}

/** `PUT /staff/:staffId/schedule` — replace a staff member's whole weekly schedule. */
export async function updateStaffSchedule(
  staffId: string,
  input: UpdateStaffScheduleInput,
): Promise<StaffScheduleResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/${encodeURIComponent(staffId)}/schedule`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<StaffScheduleResponse>(res);
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

// ── Activity feed (T3.8 → T3.9) ────────────────────────────────────────────────

/**
 * Serialise an activity-feed query to a `?key=value` string, dropping `undefined`
 * / empty values so a bare list (`GET /admin/activity`) carries no noise. The API
 * re-coerces and re-validates with the same Zod schema.
 */
export function activityQueryString(query: Partial<ListActivityQuery>): string {
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
 * `GET /admin/activity` — one filtered, server-paginated page of the gym's unified
 * activity stream (signups, bookings, check-ins, sales, subscription enrolments),
 * newest first. Gated `ReportView` API-side; an empty page is a normal result.
 */
export async function fetchActivity(
  query: Partial<ListActivityQuery> = {},
): Promise<ListActivityResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/activity${activityQueryString(query)}`, {
    headers: await authHeaders(),
    // The feed reflects live tenant state — never serve a stale stream.
    cache: 'no-store',
  });
  return unwrap<ListActivityResponse>(res);
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
 * `GET /dashboard/overview` — the FormaCore control-room overview (live occupancy,
 * the period-bounded KPIs, the range-windowed revenue series, plan mix, today's
 * schedule, real-event alerts, recent check-ins) for the caller's own gym. Gated
 * `ReportView` API-side. `range` shapes the revenue chart (default `7d`); `period`
 * (+ `from`/`to` for `custom`) drives the KPI cards (default `today`). The API
 * re-validates every field with the same Zod schema.
 */
export async function fetchDashboardOverview(params?: {
  range?: DashboardRange;
  period?: DashboardPeriod;
  from?: string;
  to?: string;
}): Promise<DashboardOverviewResponse> {
  const qs = new URLSearchParams();
  if (params?.range) qs.set('range', params.range);
  if (params?.period) qs.set('period', params.period);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const query = qs.toString();
  const res = await fetch(`${apiBaseUrl()}/dashboard/overview${query ? `?${query}` : ''}`, {
    headers: await authHeaders(),
    // The dashboard reflects live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardOverviewResponse>(res);
}

/**
 * `GET /dashboard/sales` — the hand-built Sales tab in one payload. Both params
 * scope the whole response, so the tab never shows two cards describing different
 * windows; the API `.catch`es unknown values to its own defaults.
 */
export async function fetchDashboardSales(
  query: DashboardSalesQuery,
): Promise<DashboardSalesResponse> {
  const qs = new URLSearchParams({
    granularity: query.granularity,
    productType: query.productType,
  });
  const res = await fetch(`${apiBaseUrl()}/dashboard/sales?${qs.toString()}`, {
    headers: await authHeaders(),
    // Sales figures reflect live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardSalesResponse>(res);
}

/**
 * `GET /dashboard/members` — the hand-built Members tab in one payload. All three
 * params scope the whole response, so the tab never shows two cards describing
 * different windows; the API `.catch`es unknown values to its own defaults.
 */
export async function fetchDashboardMembers(
  query: DashboardMembersQuery,
): Promise<DashboardMembersResponse> {
  const qs = new URLSearchParams({
    granularity: query.granularity,
    retentionWindow: query.retentionWindow,
    expiringWindow: query.expiringWindow,
  });
  const res = await fetch(`${apiBaseUrl()}/dashboard/members?${qs.toString()}`, {
    headers: await authHeaders(),
    // Membership figures reflect live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardMembersResponse>(res);
}

/**
 * `GET /dashboard/revenue` — the hand-built Revenue tab in one payload. Both
 * params scope the whole response, so the tab never shows two cards describing
 * different windows; the API `.catch`es unknown values to its own defaults.
 */
export async function fetchDashboardRevenue(
  query: DashboardRevenueQuery,
): Promise<DashboardRevenueResponse> {
  const qs = new URLSearchParams({
    granularity: query.granularity,
    projectionWindow: query.projectionWindow,
  });
  const res = await fetch(`${apiBaseUrl()}/dashboard/revenue?${qs.toString()}`, {
    headers: await authHeaders(),
    // Revenue reflects live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardRevenueResponse>(res);
}

/**
 * `GET /dashboard/classes` — the hand-built Classes tab in one payload. The
 * granularity scopes the whole response, so the tab never shows two cards
 * describing different windows.
 */
export async function fetchDashboardClasses(
  query: DashboardClassesQuery,
): Promise<DashboardClassesResponse> {
  const qs = new URLSearchParams({ granularity: query.granularity });
  const res = await fetch(`${apiBaseUrl()}/dashboard/classes?${qs.toString()}`, {
    headers: await authHeaders(),
    // Class figures reflect live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardClassesResponse>(res);
}

/**
 * `GET /dashboard/staff` — the hand-built Staff tab in one payload. The
 * granularity scopes the delivery figures; the rota inside the response is a
 * standing weekly schedule and does not move with it.
 */
export async function fetchDashboardStaff(
  query: DashboardStaffQuery,
): Promise<DashboardStaffResponse> {
  const qs = new URLSearchParams({ granularity: query.granularity });
  const res = await fetch(`${apiBaseUrl()}/dashboard/staff?${qs.toString()}`, {
    headers: await authHeaders(),
    // Staffing figures reflect live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardStaffResponse>(res);
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

/** Serialise a PT-sessions range query to a `?key=value` string, dropping empties. */
export function ptSessionsQueryString(query: Partial<ListAdminPtSessionsQuery>): string {
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
 * `GET /admin/pt-sessions?from=&to=&trainerId=` — 1:1 PT sessions whose `startsAt`
 * falls in `[from, to)`, ordered by start. Omit `trainerId` for every trainer's
 * sessions (how the PT tab opens); pass one to narrow to that trainer. The PT
 * calendar issues this as staff page between weeks; an empty `sessions` array is a
 * normal result the calendar renders as an empty week.
 */
export async function fetchPtSessions(
  query: ListAdminPtSessionsQuery,
): Promise<AdminPtSessionsResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/pt-sessions${ptSessionsQueryString(query)}`, {
    headers: await authHeaders(),
    // The calendar reflects live tenant state — never serve a stale week.
    cache: 'no-store',
  });
  return unwrap<AdminPtSessionsResponse>(res);
}

/**
 * `POST /admin/pt-sessions` — schedule one 1:1 PT session for a member with a
 * trainer; `endsAt` is derived from `durationMinutes` server-side. Gated
 * `ClassWrite` API-side; an unknown / cross-tenant trainer or member is a `404`.
 */
export async function createPtSession(
  input: CreatePtSessionData,
): Promise<CreatePtSessionResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/pt-sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreatePtSessionResponse>(res);
}

/**
 * `POST /admin/pt-sessions/:id/cancel` — cancel a scheduled PT session (status
 * `CANCELED`), keeping the row for history, and return the refreshed session. Gated
 * `ClassWrite` API-side; a `404 PT_SESSION_NOT_FOUND` for an unknown id.
 */
export async function cancelPtSession(id: string): Promise<PtSessionStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/pt-sessions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<PtSessionStatusResponse>(res);
}

/**
 * `POST /admin/pt-sessions/:id/complete` — mark a PT session done (status
 * `COMPLETED`) and return the refreshed session. Gated `ClassWrite` API-side; a
 * `404 PT_SESSION_NOT_FOUND` for an unknown id.
 */
export async function completePtSession(id: string): Promise<PtSessionStatusResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/pt-sessions/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<PtSessionStatusResponse>(res);
}

/**
 * `POST /admin/schedule/instances/:id/bookings/:bookingId/promote` — manually
 * promote a waitlisted booking into a held seat from the drawer (T3.6) and return
 * the refreshed detail. Gated `ClassWrite` API-side; an occurrence no longer
 * scheduled is a `409 CLASS_NOT_MODIFIABLE`, a booking not on the occurrence a
 * `404 BOOKING_NOT_FOUND`, and one already promoted / not waitlisted a `409
 * BOOKING_NOT_PROMOTABLE`.
 */
export async function promoteWaitlistEntry(
  id: string,
  bookingId: string,
): Promise<PromoteWaitlistResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/schedule/instances/${encodeURIComponent(id)}/bookings/${encodeURIComponent(
      bookingId,
    )}/promote`,
    {
      method: 'POST',
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
  return unwrap<PromoteWaitlistResponse>(res);
}

/**
 * `POST /admin/schedule/instances/:id/bookings` — book a member onto the
 * occurrence on their behalf from the drawer (T3.7) and return the refreshed
 * detail. Gated `ClassWrite` API-side; honours the same capacity/credit rules as a
 * member self-book (a seat is claimed atomically or the member is waitlisted when
 * full; a held seat draws a required class credit unless a subscription covers it).
 * Failure modes surface as an {@link ApiError}: `404 CLASS_INSTANCE_NOT_FOUND`,
 * `404 MEMBER_NOT_FOUND`, `409 CLASS_NOT_BOOKABLE`, `409 ALREADY_BOOKED`, `409
 * SUBSCRIPTION_FROZEN`, and `422 INSUFFICIENT_CREDITS`.
 */
export async function bookMemberOntoClass(
  id: string,
  memberId: string,
): Promise<BookMemberOntoClassResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/schedule/instances/${encodeURIComponent(id)}/bookings`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ memberId }),
      cache: 'no-store',
    },
  );
  return unwrap<BookMemberOntoClassResponse>(res);
}

/**
 * `POST /admin/class-instances/:id/attendance` — record attendance for one or
 * more held seats on an occurrence and return the refreshed attendance roster
 * (T3.5). Each entry flips a held-seat booking to `ATTENDED` / `NO_SHOW` and the
 * occurrence transitions to `COMPLETED`. Gated `ClassWrite` API-side; a class
 * that has not started is a `409 CLASS_NOT_STARTED`, a canceled one a `409
 * ATTENDANCE_NOT_AVAILABLE`, and an unknown / cross-tenant id a `404
 * CLASS_INSTANCE_NOT_FOUND`.
 */
export async function markAttendance(
  id: string,
  data: MarkAttendanceData,
): Promise<MarkAttendanceResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/class-instances/${encodeURIComponent(id)}/attendance`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(data),
      cache: 'no-store',
    },
  );
  return unwrap<MarkAttendanceResponse>(res);
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

// ── Reports (T4.8 → T4.9) ─────────────────────────────────────────────────────

/**
 * `GET /admin/reports` — the report catalogue: each report's key, display copy,
 * and column shape, so the Reports hub renders its cards from the API rather than
 * hardcoding them. Gated `ReportView` API-side, the same capability analytics uses.
 */
export async function fetchReportCatalog(): Promise<ReportCatalogResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/reports`, {
    headers: await authHeaders(),
    // The catalogue is static, but the session/tenant scoping is not — never cache.
    cache: 'no-store',
  });
  return unwrap<ReportCatalogResponse>(res);
}

/**
 * `GET /admin/reports/:report?range=` — run one report for on-screen preview,
 * returning its columns and computed rows over `range` (defaults to the API's
 * `30d` when omitted). Money cells are MINOR-unit integers; the view formats them.
 */
export async function fetchReport(key: ReportKey, range?: ReportRange): Promise<ReportResult> {
  const qs = range ? `?range=${encodeURIComponent(range)}` : '';
  const res = await fetch(`${apiBaseUrl()}/admin/reports/${encodeURIComponent(key)}${qs}`, {
    headers: await authHeaders(),
    // The report reflects live tenant state — never serve a stale preview.
    cache: 'no-store',
  });
  return unwrap<ReportResult>(res);
}

/**
 * `GET /admin/reports/:report/export?range=&format=` — the raw streaming file
 * response (CSV or XLSX), with the staff bearer token forwarded. Returned as the
 * live `Response` (not parsed) so the admin route handler can pipe its body
 * straight to the browser as a download, mirroring {@link fetchInvoicePdf}.
 */
export async function fetchReportExport(
  key: ReportKey,
  query: { range?: ReportRange; format?: ReportFormat } = {},
): Promise<Response> {
  const params = new URLSearchParams();
  if (query.range) {
    params.set('range', query.range);
  }
  if (query.format) {
    params.set('format', query.format);
  }
  const qs = params.toString();
  return fetch(
    `${apiBaseUrl()}/admin/reports/${encodeURIComponent(key)}/export${qs ? `?${qs}` : ''}`,
    {
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
}

/**
 * Fetch one DRILL-DOWN's file export as a raw upstream `Response`, so the route
 * handler can pipe its body straight through. Mirrors {@link fetchReportExport};
 * the drill-down is keyed by metric rather than by catalogue key.
 */
export async function fetchReportDrilldownExport(
  metric: ReportMetric,
  query: { range?: ReportDrilldownRange; format?: ReportFormat } = {},
): Promise<Response> {
  const params = new URLSearchParams();
  if (query.range) {
    params.set('range', query.range);
  }
  if (query.format) {
    params.set('format', query.format);
  }
  const qs = params.toString();
  return fetch(
    `${apiBaseUrl()}/admin/reports/drilldown/${encodeURIComponent(metric)}/export${
      qs ? `?${qs}` : ''
    }`,
    {
      headers: await authHeaders(),
      cache: 'no-store',
    },
  );
}

// ── Reports drill-down + Pin to Dashboard (T12.12) ────────────────────────────

/**
 * `GET /admin/reports/drilldown/:metric?range=` — one drill-down report (KPIs +
 * typed sections) for on-screen rendering over `range` (defaults to the API's
 * `30d`). Money cells are MINOR-unit integers; the view formats them. Gated
 * `ReportView` API-side.
 */
export async function fetchReportDrilldown(
  metric: ReportMetric,
  range?: ReportRange,
): Promise<ReportDrilldown> {
  const qs = range ? `?range=${encodeURIComponent(range)}` : '';
  const res = await fetch(
    `${apiBaseUrl()}/admin/reports/drilldown/${encodeURIComponent(metric)}${qs}`,
    {
      headers: await authHeaders(),
      // The report reflects live tenant state — never serve a stale drill-down.
      cache: 'no-store',
    },
  );
  return unwrap<ReportDrilldown>(res);
}

/**
 * Open the live class-occupancy stream (`GET /admin/schedule/stream`, T8.10) with
 * the staff token attached, returning the raw upstream `Response` so a route
 * handler can pipe its `text/event-stream` body straight to the browser. The
 * browser's `EventSource` can't send the httpOnly-cookie token as a Bearer header,
 * so the schedule board subscribes to a same-origin proxy route that calls this —
 * the same token-forwarding shape as the file-export proxies, but long-lived.
 */
export async function fetchScheduleStream(signal?: AbortSignal): Promise<Response> {
  return fetch(`${apiBaseUrl()}/admin/schedule/stream`, {
    headers: { ...(await authHeaders()), accept: 'text/event-stream' },
    cache: 'no-store',
    signal,
  });
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

/** `GET /gyms/settings/email-templates` — every system email and its current wording. */
export async function fetchEmailTemplates(): Promise<ListEmailTemplatesResponse> {
  const res = await fetch(`${apiBaseUrl()}/gyms/settings/email-templates`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListEmailTemplatesResponse>(res);
}

/** `PUT /gyms/settings/email-templates/:key` — save this gym's wording for one email. */
export async function updateEmailTemplate(
  key: string,
  input: UpdateEmailTemplateInput,
): Promise<EmailTemplateRow> {
  const res = await fetch(
    `${apiBaseUrl()}/gyms/settings/email-templates/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(input),
      cache: 'no-store',
    },
  );
  return unwrap<EmailTemplateRow>(res);
}

/** `POST /gyms/settings/email-templates/:key/reset` — go back to the built-in wording. */
export async function resetEmailTemplate(key: string): Promise<EmailTemplateRow> {
  const res = await fetch(
    `${apiBaseUrl()}/gyms/settings/email-templates/${encodeURIComponent(key)}/reset`,
    { method: 'POST', headers: await authHeaders(), cache: 'no-store' },
  );
  return unwrap<EmailTemplateRow>(res);
}

/**
 * `GET /orders` — one filtered, paginated page of the gym's orders (T7.9): every
 * sale the till and the online shop have recorded, newest first.
 */
export async function fetchOrders(query: ListOrdersQueryInput = {}): Promise<ListOrdersResponse> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.channel) params.set('channel', query.channel);
  if (query.status) params.set('status', query.status);
  if (query.memberId) params.set('memberId', query.memberId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const qs = params.toString();
  const res = await fetch(`${apiBaseUrl()}/orders${qs ? `?${qs}` : ''}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListOrdersResponse>(res);
}

/**
 * `GET /orders/:id` — one order in full: its lines, payments, refunds and the
 * status timeline. A `404` here is an unknown or cross-tenant id.
 */
export async function fetchOrder(id: string): Promise<AdminOrderDetail> {
  const res = await fetch(`${apiBaseUrl()}/orders/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<AdminOrderDetail>(res);
}

/**
 * `GET /invoices/:id/pdf` — a member invoice's PDF (T5.10), with the staff token
 * forwarded. Returned as the live `Response` (not parsed) so the admin route handler
 * pipes its body straight to the browser as a download. The API renders (and caches to
 * R2) on first access and 404s a cross-tenant / unknown id.
 */
export async function fetchInvoicePdf(id: string): Promise<Response> {
  return fetch(`${apiBaseUrl()}/invoices/${encodeURIComponent(id)}/pdf`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
}

// ── Admin invoices — the Payments hub's Invoices tab ──────────────────────────

/** Serialise an invoice roster query to a `?key=value` string, dropping empty values. */
export function invoicesQueryString(query: Partial<ListAdminInvoicesQuery>): string {
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

/** `GET /admin/invoices` — one filtered, server-paginated page of the gym's invoices. */
export async function fetchAdminInvoices(
  query: Partial<ListAdminInvoicesQuery> = {},
): Promise<ListAdminInvoicesResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/invoices${invoicesQueryString(query)}`, {
    headers: await authHeaders(),
    // Always reflect the live billing state — never serve a stale staff view.
    cache: 'no-store',
  });
  return unwrap<ListAdminInvoicesResponse>(res);
}

/** `POST /admin/invoices` — raise an invoice by hand. Gated `BillingManage`. */
export async function createAdminInvoice(input: CreateInvoiceData): Promise<CreateInvoiceResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/invoices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<CreateInvoiceResponse>(res);
}

/**
 * `POST /admin/invoices/:id/email` — email the invoice to its member with the PDF
 * attached. Throws an {@link ApiError} carrying `EMAIL_NOT_CONFIGURED` (503) when
 * outbound mail is off, or `INVOICE_HAS_NO_RECIPIENT` (422) when there is nobody to
 * send it to; the row action translates both to a staff-facing message.
 */
export async function emailAdminInvoice(id: string): Promise<SendInvoiceEmailResponse> {
  const res = await fetch(`${apiBaseUrl()}/admin/invoices/${encodeURIComponent(id)}/email`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<SendInvoiceEmailResponse>(res);
}

// ── Automation — rules, templates, catalog (T12.6) ────────────────────────────

/** Serialise an automation-rules query, dropping empty values (same roster contract). */
export function automationRulesQueryString(query: Partial<ListAutomationRulesQuery>): string {
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

/** `GET /automation/catalog` — the trigger / action / timing catalogs the builder renders. */
export async function fetchAutomationCatalog(): Promise<AutomationCatalogResponse> {
  const res = await fetch(`${apiBaseUrl()}/automation/catalog`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<AutomationCatalogResponse>(res);
}

/** `GET /automation/rules` — one filtered, server-paginated page of active (non-template) rules. */
export async function fetchAutomationRules(
  query: Partial<ListAutomationRulesQuery> = {},
): Promise<ListAutomationRulesResponse> {
  const res = await fetch(`${apiBaseUrl()}/automation/rules${automationRulesQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAutomationRulesResponse>(res);
}

/** `GET /automation/templates` — every reusable template, newest first. */
export async function fetchAutomationTemplates(): Promise<ListAutomationTemplatesResponse> {
  const res = await fetch(`${apiBaseUrl()}/automation/templates`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAutomationTemplatesResponse>(res);
}

/** `GET /automation/stats` — summary KPIs for the automation console header. */
export async function fetchAutomationStats(): Promise<AutomationStats> {
  const res = await fetch(`${apiBaseUrl()}/automation/stats`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<AutomationStats>(res);
}

/** `POST /automation/rules` — create a rule (active by default); returns its detail. */
export async function createAutomationRule(
  input: CreateAutomationRuleInput,
): Promise<GetAutomationRuleResponse> {
  const res = await fetch(`${apiBaseUrl()}/automation/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<GetAutomationRuleResponse>(res);
}

/** `PATCH /automation/rules/:id` — edit a rule; returns the updated detail. */
export async function updateAutomationRule(
  id: string,
  input: UpdateAutomationRuleInput,
): Promise<GetAutomationRuleResponse> {
  const res = await fetch(`${apiBaseUrl()}/automation/rules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<GetAutomationRuleResponse>(res);
}

/** `POST /automation/rules/:id/toggle` — flip a rule's active state; returns the updated detail. */
export async function toggleAutomationRule(
  id: string,
  active: boolean,
): Promise<GetAutomationRuleResponse> {
  const res = await fetch(`${apiBaseUrl()}/automation/rules/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ active }),
    cache: 'no-store',
  });
  return unwrap<GetAutomationRuleResponse>(res);
}

/** `POST /automation/rules/:id/save-as-template` — save a rule as a reusable template. */
export async function saveAutomationRuleAsTemplate(
  id: string,
  input: SaveAsTemplateInput,
): Promise<GetAutomationRuleResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/automation/rules/${encodeURIComponent(id)}/save-as-template`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(input),
      cache: 'no-store',
    },
  );
  return unwrap<GetAutomationRuleResponse>(res);
}

/** `DELETE /automation/rules/:id` — delete a rule and its runs. */
export async function deleteAutomationRule(id: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/automation/rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<never>(res);
  }
}

// ── Marketing — campaigns, templates, segments, catalog (T12.7 / T12.8) ────────

/** Serialise a campaigns query, dropping empty values (same roster contract). */
export function campaignsQueryString(query: Partial<ListCampaignsQuery>): string {
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

/** `GET /marketing/catalog` — the channel + merge-field catalogs the composer renders. */
export async function fetchMarketingCatalog(): Promise<MarketingCatalogResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/catalog`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<MarketingCatalogResponse>(res);
}

/** `GET /marketing/segments` — every saved audience segment, newest first. */
export async function fetchMarketingSegments(): Promise<ListAudienceSegmentsResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/segments`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListAudienceSegmentsResponse>(res);
}

/** `POST /marketing/segments/preview` — resolve ad-hoc criteria to a count + sample. */
export async function previewMarketingCriteria(
  criteria: AudienceCriteria,
): Promise<AudiencePreviewResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/segments/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ criteria }),
    cache: 'no-store',
  });
  return unwrap<AudiencePreviewResponse>(res);
}

/** `GET /marketing/segments/:id/preview` — resolve a saved segment to a count + sample. */
export async function previewMarketingSegment(id: string): Promise<AudiencePreviewResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/segments/${encodeURIComponent(id)}/preview`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<AudiencePreviewResponse>(res);
}

/** `POST /marketing/segments` — save a named audience segment; returns the row. */
export async function createMarketingSegment(
  input: CreateAudienceSegmentInput,
): Promise<AudienceSegmentRow> {
  const res = await fetch(`${apiBaseUrl()}/marketing/segments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<AudienceSegmentRow>(res);
}

/** `PATCH /marketing/segments/:id` — edit a saved segment; returns the row. */
export async function updateMarketingSegment(
  id: string,
  input: UpdateAudienceSegmentInput,
): Promise<AudienceSegmentRow> {
  const res = await fetch(`${apiBaseUrl()}/marketing/segments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<AudienceSegmentRow>(res);
}

/** `DELETE /marketing/segments/:id` — delete a saved segment. */
export async function deleteMarketingSegment(id: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/marketing/segments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<never>(res);
  }
}

/** `GET /marketing/templates` — every message template, newest first. */
export async function fetchMessageTemplates(): Promise<ListMessageTemplatesResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/templates`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListMessageTemplatesResponse>(res);
}

/** `POST /marketing/templates` — create a message template; returns the row. */
export async function createMessageTemplate(
  input: CreateMessageTemplateInput,
): Promise<MessageTemplateRow> {
  const res = await fetch(`${apiBaseUrl()}/marketing/templates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<MessageTemplateRow>(res);
}

/** `PATCH /marketing/templates/:id` — edit a message template; returns the row. */
export async function updateMessageTemplate(
  id: string,
  input: UpdateMessageTemplateInput,
): Promise<MessageTemplateRow> {
  const res = await fetch(`${apiBaseUrl()}/marketing/templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<MessageTemplateRow>(res);
}

/** `DELETE /marketing/templates/:id` — delete a message template. */
export async function deleteMessageTemplate(id: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/marketing/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<never>(res);
  }
}

/** `GET /marketing/campaigns` — one filtered, server-paginated page of campaigns. */
export async function fetchCampaigns(
  query: Partial<ListCampaignsQuery> = {},
): Promise<ListCampaignsResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/campaigns${campaignsQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListCampaignsResponse>(res);
}

/** `POST /marketing/campaigns` — create a draft campaign; returns its detail. */
export async function createCampaign(input: CreateCampaignInput): Promise<GetCampaignResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/campaigns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<GetCampaignResponse>(res);
}

/** `PATCH /marketing/campaigns/:id` — edit a campaign (not once sent); returns detail. */
export async function updateCampaign(
  id: string,
  input: UpdateCampaignInput,
): Promise<GetCampaignResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/campaigns/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<GetCampaignResponse>(res);
}

/** `POST /marketing/campaigns/:id/send` — send now; returns the updated detail. */
export async function sendCampaign(id: string): Promise<GetCampaignResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/campaigns/${encodeURIComponent(id)}/send`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<GetCampaignResponse>(res);
}

/** `POST /marketing/campaigns/:id/schedule` — schedule for a future `scheduledAt`. */
export async function scheduleCampaign(
  id: string,
  input: ScheduleCampaignInput,
): Promise<GetCampaignResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/marketing/campaigns/${encodeURIComponent(id)}/schedule`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(input),
      cache: 'no-store',
    },
  );
  return unwrap<GetCampaignResponse>(res);
}

/** `POST /marketing/campaigns/:id/save-as-template` — save the message as a template. */
export async function saveCampaignAsTemplate(
  id: string,
  input: SaveCampaignAsTemplateInput,
): Promise<MessageTemplateRow> {
  const res = await fetch(
    `${apiBaseUrl()}/marketing/campaigns/${encodeURIComponent(id)}/save-as-template`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(input),
      cache: 'no-store',
    },
  );
  return unwrap<MessageTemplateRow>(res);
}

/** `DELETE /marketing/campaigns/:id` — delete a campaign. */
export async function deleteCampaign(id: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/marketing/campaigns/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<never>(res);
  }
}

/** `GET /marketing/promo-codes` — every promo code, newest first. */
export async function fetchPromoCodes(): Promise<ListPromoCodesResponse> {
  const res = await fetch(`${apiBaseUrl()}/marketing/promo-codes`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListPromoCodesResponse>(res);
}

/** `POST /marketing/promo-codes` — create a promo code; returns the row. */
export async function createPromoCode(input: CreatePromoCodeInput): Promise<PromoCodeRow> {
  const res = await fetch(`${apiBaseUrl()}/marketing/promo-codes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<PromoCodeRow>(res);
}

/** `PATCH /marketing/promo-codes/:id` — edit a promo code; returns the row. */
export async function updatePromoCode(
  id: string,
  input: UpdatePromoCodeInput,
): Promise<PromoCodeRow> {
  const res = await fetch(`${apiBaseUrl()}/marketing/promo-codes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<PromoCodeRow>(res);
}

/** `POST /marketing/promo-codes/:id/toggle` — flip a code active/inactive; returns the row. */
export async function togglePromoCode(
  id: string,
  input: TogglePromoCodeInput,
): Promise<PromoCodeRow> {
  const res = await fetch(
    `${apiBaseUrl()}/marketing/promo-codes/${encodeURIComponent(id)}/toggle`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(input),
      cache: 'no-store',
    },
  );
  return unwrap<PromoCodeRow>(res);
}

/** `DELETE /marketing/promo-codes/:id` — delete a promo code. */
export async function deletePromoCode(id: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/marketing/promo-codes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<never>(res);
  }
}

// ── Loyalty — program, rewards, redemptions, member balance/ledger (T12.10) ────

/** Serialise a redemptions query, dropping empty values (same roster contract). */
export function redemptionsQueryString(query: Partial<ListRedemptionsQuery>): string {
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

/** `GET /loyalty/catalog` — reward-type + reason catalogs for the admin pickers. */
export async function fetchLoyaltyCatalog(): Promise<LoyaltyCatalogResponse> {
  const res = await fetch(`${apiBaseUrl()}/loyalty/catalog`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<LoyaltyCatalogResponse>(res);
}

/** `GET /loyalty/program` — the gym's loyalty program configuration. */
export async function fetchLoyaltyProgram(): Promise<LoyaltyProgramResponse> {
  const res = await fetch(`${apiBaseUrl()}/loyalty/program`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<LoyaltyProgramResponse>(res);
}

/** `PUT /loyalty/program` — update the program config; returns the saved config. */
export async function updateLoyaltyProgram(
  input: UpdateLoyaltyProgramInput,
): Promise<LoyaltyProgramResponse> {
  const res = await fetch(`${apiBaseUrl()}/loyalty/program`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<LoyaltyProgramResponse>(res);
}

/** `GET /loyalty/rewards` — the rewards catalogue. */
export async function fetchLoyaltyRewards(): Promise<ListLoyaltyRewardsResponse> {
  const res = await fetch(`${apiBaseUrl()}/loyalty/rewards`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListLoyaltyRewardsResponse>(res);
}

/** `POST /loyalty/rewards` — create a reward; returns the new row. */
export async function createLoyaltyReward(
  input: CreateLoyaltyRewardInput,
): Promise<LoyaltyRewardRow> {
  const res = await fetch(`${apiBaseUrl()}/loyalty/rewards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<LoyaltyRewardRow>(res);
}

/** `PATCH /loyalty/rewards/:id` — edit a reward; returns the updated row. */
export async function updateLoyaltyReward(
  id: string,
  input: UpdateLoyaltyRewardInput,
): Promise<LoyaltyRewardRow> {
  const res = await fetch(`${apiBaseUrl()}/loyalty/rewards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return unwrap<LoyaltyRewardRow>(res);
}

/** `DELETE /loyalty/rewards/:id` — delete a reward. */
export async function deleteLoyaltyReward(id: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/loyalty/rewards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    await unwrap<never>(res);
  }
}

/** `GET /loyalty/redemptions` — one filtered, server-paginated page of redemptions. */
export async function fetchRedemptions(
  query: Partial<ListRedemptionsQuery> = {},
): Promise<ListRedemptionsResponse> {
  const res = await fetch(`${apiBaseUrl()}/loyalty/redemptions${redemptionsQueryString(query)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<ListRedemptionsResponse>(res);
}
