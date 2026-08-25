'use server';

import {
  Permission,
  recordPosSaleSchema,
  roleHasPermission,
  sendReceiptSchema,
  type AdminProductRow,
  type MemberKind,
  type MemberRow,
  type MemberStatus,
  type RecordPosSaleInput,
  type RecordPosSaleResponse,
  type SendReceiptInput,
  type SendReceiptResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  fetchAdminServices,
  fetchLocations,
  fetchMembers,
  fetchProductCategories,
  fetchProducts,
  fetchSubscriptionPlans,
  recordPosSale,
  sendPosReceipt,
} from '@/lib/api';

/** Discriminated result returned to the client — a Server Action never throws across the boundary. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * One product as the POS grid renders it — the catalogue fields a sale needs and
 * nothing else (no variant list, no timestamps). `priceAmount` is in the
 * currency's minor units; `imageUrl` is the primary gallery image or `null`.
 */
export interface PosProductRow {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  imageUrl: string | null;
}

/** One shelf as the till's category filter renders it — the id it filters by, and its label. */
export interface PosCategoryRow {
  id: string;
  name: string;
}

/**
 * One member as the POS lookup renders it. `photoUrl` is always `null` for now —
 * the member profile doesn't carry an avatar yet (lands with T4.3) — but the
 * field is on the contract so the UI and a later API can agree without a change.
 */
export interface PosMemberRow {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  photoUrl: string | null;
  /**
   * The live plan's name, or `null` for someone on none. The till's member table
   * shows it: "which of these two Ninos is the one on Premium" is the question an
   * operator actually has to answer, and a name and a phone alone cannot.
   */
  planName: string | null;
  /**
   * What this person currently is to the gym — the roster's own standing, derived
   * from their subscriptions. The till's badge reads off this: whether someone is
   * a paying member, a guest, or lapsed decides what happens next at the counter.
   */
  kind: MemberKind;
  /**
   * The account's own state. Carried alongside {@link kind} because the two can
   * disagree: a suspended account may still hold a live subscription, and a green
   * "Member" badge over a suspended one is exactly the mistake worth preventing.
   */
  status: MemberStatus;
}

/** Max products the grid shows for one search — a tablet screen of tiles. */
const PRODUCT_RESULT_LIMIT = 24;

/** Max members the lookup shows (the contract caps partial matches at 10). */
const MEMBER_RESULT_LIMIT = 10;

/** Max rows the browsable member table shows — a screenful, scrolled, not paged. */
const MEMBER_TABLE_LIMIT = 50;

/** Re-assert a capability inside the action — defence in depth behind the route + API guards. */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Search failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/** Project an admin product row onto the lean POS shape. */
function toPosProduct(row: AdminProductRow): PosProductRow {
  return {
    id: row.id,
    name: row.name,
    priceAmount: row.priceAmount,
    currency: row.currency,
    imageUrl: row.imageUrl,
  };
}

/** Project a member roster row onto the lean POS lookup shape. */
function toPosMember(row: MemberRow): PosMemberRow {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    photoUrl: null,
    planName: row.plan?.name ?? row.planName,
    kind: row.kind,
    status: row.status,
  };
}

/**
 * Search the gym's **active** catalogue for the POS grid. Reuses the tenant-scoped
 * `GET /admin/products` roster endpoint (which already filters by name and is
 * gym-scoped from the session token), narrowed to `ACTIVE` so a sale can never add
 * a discontinued product. A blank query returns the first page of the catalogue so
 * the grid is populated before the operator types. Enforces `ProductRead`.
 *
 * `categoryId` narrows to one shelf (or {@link UNCATEGORISED_FILTER} for the
 * products filed under none); an empty string is every category. The till only
 * shows one page of tiles, so on a catalogue larger than that page the shelf is
 * how an operator reaches a product they cannot spell — the search box only helps
 * someone who already knows the name.
 */
export async function searchPosProductsAction(
  query: string,
  categoryId = '',
): Promise<ActionResult<PosProductRow[]>> {
  if (!(await sessionHas(Permission.ProductRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const result = await fetchProducts({
      search: query.trim() || undefined,
      categoryId: categoryId.trim() || undefined,
      status: 'ACTIVE',
      limit: PRODUCT_RESULT_LIMIT,
      sort: 'name',
      dir: 'asc',
    });
    return { ok: true, data: result.data.map(toPosProduct) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * The gym's product shelves, for the till's category filter — every one of them,
 * ordered by name as the API returns them.
 *
 * Empty shelves are deliberately kept. Hiding them looks tidier and is wrong: a
 * shelf usually exists before the products are filed onto it, so dropping the
 * empty ones makes the filter vanish exactly when a gym has started organising
 * its catalogue and is looking for the result. The count would be a poor
 * predictor anyway — it counts inactive products too, which the till cannot sell.
 *
 * Enforces `ProductRead`, the same capability the grid behind it needs.
 */
export async function fetchPosCategoriesAction(): Promise<ActionResult<PosCategoryRow[]>> {
  if (!(await sessionHas(Permission.ProductRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const { data } = await fetchProductCategories();
    return { ok: true, data: data.map((category) => ({ id: category.id, name: category.name })) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Look up members by partial name / phone / email for attaching a sale to one.
 * Reuses the tenant-scoped `GET /members` roster search and caps the result at 10
 * (the contract's partial-match limit). A blank query returns no rows — the
 * lookup only fetches once the operator has typed something. Enforces `MemberRead`.
 */
export async function lookupPosMembersAction(query: string): Promise<ActionResult<PosMemberRow[]>> {
  if (!(await sessionHas(Permission.MemberRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  const trimmed = query.trim();
  if (trimmed === '') {
    return { ok: true, data: [] };
  }
  try {
    const result = await fetchMembers({
      search: trimmed,
      limit: MEMBER_RESULT_LIMIT,
      sort: 'name',
      dir: 'asc',
    });
    return { ok: true, data: result.data.map(toPosMember) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * The gym's members as the till's **Members** table browses them, by name.
 *
 * The counterpart to {@link lookupPosMembersAction}, and deliberately not the same
 * call: that one answers "find the person I am being told about" and returns
 * nothing until something is typed, which is right for a lookup box and useless
 * for a table. This one opens on the roster, because half the people at a counter
 * cannot spell their own name the way it was entered — the operator recognises it
 * far faster than they can type it.
 *
 * Enforces `MemberRead`.
 */
export async function fetchPosMembersAction(query: string): Promise<ActionResult<PosMemberRow[]>> {
  if (!(await sessionHas(Permission.MemberRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const result = await fetchMembers({
      search: query.trim() || undefined,
      limit: MEMBER_TABLE_LIMIT,
      sort: 'name',
      dir: 'asc',
    });
    return { ok: true, data: result.data.map(toPosMember) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Email a customer the receipt of a completed POS sale (T7.4). Re-validates the
 * snapshot against the shared `sendReceiptSchema` before forwarding it to the
 * `POST /orders/receipt` API (which renders + sends the receipt), so a malformed
 * payload is rejected at the boundary rather than surfacing as an opaque API 400.
 * Enforces `BillingRead` — the same capability the API gates the route on, held by
 * the POS-operator roles. The returned `delivered:false` (email unconfigured) is a
 * successful action, not an error — the caller distinguishes the two.
 */
export async function emailReceiptAction(
  input: SendReceiptInput,
): Promise<ActionResult<SendReceiptResponse>> {
  if (!(await sessionHas(Permission.BillingRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = sendReceiptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid receipt details' };
  }
  try {
    return { ok: true, data: await sendPosReceipt(parsed.data) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Persist a completed POS sale (T7.5) as a paid order + captured payment so the
 * day's takings exist for the end-of-day reconciliation. Re-validates the snapshot
 * against the shared `recordPosSaleSchema` before forwarding it to the
 * `POST /orders/pos-sale` API, and enforces `BillingRead` — the same capability the
 * API gates the route on, held by the POS-operator roles. Returns the created ids
 * so the board can finish the sale.
 */
export async function recordPosSaleAction(
  input: RecordPosSaleInput,
): Promise<ActionResult<RecordPosSaleResponse>> {
  if (!(await sessionHas(Permission.BillingRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = recordPosSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid sale details' };
  }
  try {
    return { ok: true, data: await recordPosSale(parsed.data) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * One membership as the POS catalogue renders it — the plan's sellable face.
 * `priceAmount` is in the currency's minor units; `durationLabel` is the renewal
 * cadence spelled out for the card's badge ("30 days" / "365 days").
 */
export interface PosMembershipRow {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  durationLabel: string;
}

/** Enough plans to fill the POS catalogue without paging — a gym has a handful. */
const MEMBERSHIP_RESULT_LIMIT = 50;

/** Days per renewal cadence, for the card's duration badge. */
const INTERVAL_DAYS: Record<string, number> = { MONTH: 30, YEAR: 365 };

/**
 * The gym's sellable memberships for the POS catalogue — its **active** subscription
 * plans, cheapest first so the desk's common sale is nearest to hand.
 *
 * Gated on `BillingRead`, the same capability the POS sale itself needs, so a
 * till-operator role that can ring up a sale can also see what there is to sell.
 */
export async function fetchPosMembershipsAction(): Promise<ActionResult<PosMembershipRow[]>> {
  if (!(await sessionHas(Permission.BillingRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const { data } = await fetchSubscriptionPlans({
      limit: MEMBERSHIP_RESULT_LIMIT,
      status: 'ACTIVE',
      sort: 'price',
      dir: 'asc',
    });
    return {
      ok: true,
      data: data.map((plan) => ({
        id: plan.id,
        name: plan.name,
        priceAmount: plan.priceAmount,
        currency: plan.currency,
        durationLabel: `${INTERVAL_DAYS[plan.interval] ?? 30} days`,
      })),
    };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** A catalogue service as the POS Services tab renders it. */
export interface PosServiceRow {
  id: string;
  name: string;
  staffName: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
}

/** Enough services to fill the tab without paging — a gym has a handful. */
const SERVICE_RESULT_LIMIT = 100;

/** The gym's ACTIVE services, priced, for the Services tab. */
export async function fetchPosServicesAction(): Promise<ActionResult<PosServiceRow[]>> {
  if (!(await sessionHas(Permission.ProductRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const { data } = await fetchAdminServices({
      limit: SERVICE_RESULT_LIMIT,
      status: 'ACTIVE',
      sort: 'name',
      dir: 'asc',
    });
    return {
      ok: true,
      data: data.map((service) => ({
        id: service.id,
        name: service.name,
        staffName: service.staff.name,
        priceAmount: service.priceMinor,
        currency: service.currency,
        durationMinutes: service.durationMinutes,
      })),
    };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** One branch the till can be attributed to. */
export interface PosLocationRow {
  id: string;
  name: string;
}

/** Enough branches to fill the selector without paging. */
const LOCATION_RESULT_LIMIT = 100;

/**
 * The gym's **active** branches, for the POS's "selling at" selector. Recorded on
 * the order so a multi-site gym can split takings and reports by branch; a
 * single-site gym gets one option and never thinks about it.
 *
 * Gated on `LocationRead`. A failure is the caller's to handle — the POS degrades to
 * no branch rather than blocking the sale.
 */
export async function fetchPosLocationsAction(): Promise<ActionResult<PosLocationRow[]>> {
  if (!(await sessionHas(Permission.LocationRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const { data } = await fetchLocations({
      limit: LOCATION_RESULT_LIMIT,
      status: 'ACTIVE',
      sort: 'name',
      dir: 'asc',
    });
    return { ok: true, data: data.map((row) => ({ id: row.id, name: row.name })) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
