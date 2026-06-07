'use server';

import { Permission, roleHasPermission, type AdminProductRow, type MemberRow } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMembers, fetchProducts } from '@/lib/api';

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
 * Resolve the member a scanned QR code identifies. The member QR (shown in the
 * mobile app, T6.9) encodes a check-in token; until the dedicated
 * `GET /check-in/qr-token` decode endpoint lands, the POS treats the scanned
 * payload as a lookup term — a raw member id resolves directly, and anything else
 * falls through to the same partial search the typed lookup uses. Returns the
 * single resolved member, or `null` when the scan matches nobody. Enforces
 * `MemberRead`.
 */
export async function resolvePosMemberByQrAction(
  scanned: string,
): Promise<ActionResult<PosMemberRow | null>> {
  if (!(await sessionHas(Permission.MemberRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  const token = scanned.trim();
  if (token === '') {
    return { ok: true, data: null };
  }
  try {
    const result = await fetchMembers({
      search: token,
      limit: MEMBER_RESULT_LIMIT,
      sort: 'name',
      dir: 'asc',
    });
    // Prefer an exact id match (a raw member-id QR); otherwise take the top hit.
    const exact = result.data.find((row) => row.id === token);
    const resolved = exact ?? result.data[0] ?? null;
    return { ok: true, data: resolved ? toPosMember(resolved) : null };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
