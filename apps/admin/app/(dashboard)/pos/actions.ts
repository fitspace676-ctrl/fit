'use server';

import {
  Permission,
  createMemberSchema,
  recordPosSaleSchema,
  roleHasPermission,
  sendReceiptSchema,
  type AdminProductRow,
  type MemberRow,
  type RecordPosSaleInput,
  type RecordPosSaleResponse,
  type SendReceiptInput,
  type SendReceiptResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createMember,
  fetchLocations,
  fetchMembers,
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
}

/** Max products the grid shows for one search — a tablet screen of tiles. */
const PRODUCT_RESULT_LIMIT = 24;

/** Max members the lookup shows (the contract caps partial matches at 10). */
const MEMBER_RESULT_LIMIT = 10;

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
  };
}

/**
 * Search the gym's **active** catalogue for the POS grid. Reuses the tenant-scoped
 * `GET /admin/products` roster endpoint (which already filters by name and is
 * gym-scoped from the session token), narrowed to `ACTIVE` so a sale can never add
 * a discontinued product. A blank query returns the first page of the catalogue so
 * the grid is populated before the operator types. Enforces `ProductRead`.
 */
export async function searchPosProductsAction(
  query: string,
): Promise<ActionResult<PosProductRow[]>> {
  if (!(await sessionHas(Permission.ProductRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const result = await fetchProducts({
      search: query.trim() || undefined,
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

/**
 * Register a member from the desk and hand them straight back for the sale in
 * progress.
 *
 * The counter is where people join: someone walks in, wants a membership, and has
 * no record yet. A membership can only be sold to a member (it creates a real
 * subscription), so without this the operator would have to leave the till, create
 * the member on the Members screen, and start the sale over.
 *
 * Deliberately the minimum a sale needs — name, email, phone — rather than the full
 * intake form; the rest of the profile can be filled in later from the member's page.
 * Gated on `MemberWrite`, the same capability the Members screen's create needs, so
 * a till-only role can't quietly add people to the roster.
 */
export async function createPosMemberAction(input: {
  name: string;
  email: string;
  phone: string;
}): Promise<ActionResult<PosMemberRow>> {
  if (!(await sessionHas(Permission.MemberWrite))) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createMemberSchema.safeParse({
    name: input.name,
    email: input.email,
    // The contract drops a blank phone rather than storing an empty string.
    phone: input.phone.trim() || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid member details' };
  }
  try {
    const created = await createMember(parsed.data);
    return {
      ok: true,
      data: {
        id: created.id,
        name: created.name,
        phone: created.phone ?? null,
        email: created.email,
        photoUrl: null,
      },
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, error: 'A member with that email already exists — search for them.' };
    }
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
