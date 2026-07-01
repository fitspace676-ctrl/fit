'use server';

import {
  Permission,
  recordCheckInSchema,
  roleHasPermission,
  type CheckInRow,
  type MemberEligibility,
  type MemberRow,
  type RecordCheckInInput,
  type RecordCheckInResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMembers, fetchMemberEligibility, recordCheckIn } from '@/lib/api';

/** Discriminated result returned to the client — a Server Action never throws across the boundary. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * One member as the reception lookup renders it. `photoUrl` is always `null` for
 * now — the member profile doesn't carry an avatar yet — but the field is on the
 * shape so the UI and a later API can agree without a change.
 */
export interface CheckInMemberRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
}

/** Max members the lookup shows (the roster contract caps partial matches at 10). */
const MEMBER_RESULT_LIMIT = 10;

/** Re-assert a capability inside the action — defence in depth behind the route + API guards. */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'MEMBER_NOT_FOUND') {
      return 'That member no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/** Project a member roster row onto the lean reception lookup shape. */
function toCheckInMember(row: MemberRow): CheckInMemberRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    photoUrl: null,
  };
}

/**
 * Look up members by partial name / email for the manual check-in card. Reuses the
 * tenant-scoped `GET /members` roster search and caps the result at 10 (the
 * contract's partial-match limit). A blank query returns no rows — the lookup only
 * fetches once the receptionist has typed something. Enforces `MemberRead`.
 */
export async function searchCheckInMembersAction(
  query: string,
): Promise<ActionResult<CheckInMemberRow[]>> {
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
    return { ok: true, data: result.data.map(toCheckInMember) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Fetch a member's current eligibility (status + plan) for the eligibility card.
 * Reuses `GET /admin/check-ins/eligibility`. Enforces `MemberRead`.
 */
export async function fetchEligibilityAction(
  gymMemberId: string,
): Promise<ActionResult<MemberEligibility>> {
  if (!(await sessionHas(Permission.MemberRead))) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    return { ok: true, data: await fetchMemberEligibility(gymMemberId) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Record a member's arrival. Re-validates the body with the same Zod schema the
 * API uses (so a malformed submission fails fast), enforces `MemberWrite`, and
 * returns the created row + the member's eligibility so the board can prepend the
 * arrival to the live feed. Enforces `MemberWrite`.
 */
export async function recordCheckInAction(
  input: RecordCheckInInput,
): Promise<ActionResult<RecordCheckInResponse>> {
  if (!(await sessionHas(Permission.MemberWrite))) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = recordCheckInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid check-in details' };
  }
  try {
    return { ok: true, data: await recordCheckIn(parsed.data) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Re-exported so the client can render an optimistic row without a round-trip type. */
export type { CheckInRow };
