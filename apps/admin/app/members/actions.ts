'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  createMemberSchema,
  roleHasPermission,
  updateMemberSchema,
  type BulkExportMembersInput,
  type CreateMemberInput,
  type MemberDetail,
  type UpdateMemberInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  bulkExportMembers,
  createMember,
  deactivateMember,
  reactivateMember,
  updateMember,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware already gates
 * the `/members` route, but a Server Action is a POST endpoint in its own right,
 * so re-checking the session's capability here keeps it safe even if the matcher
 * ever changes — defence in depth, not a substitute for the gate. (The API
 * re-checks again behind its own guards.)
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireMemberRead = () => sessionHas(Permission.MemberRead);
const requireMemberWrite = () => sessionHas(Permission.MemberWrite);

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // The API returns a stable error code (e.g. MEMBER_EXISTS) — translate the
    // ones staff act on to plain language; otherwise show the code + status.
    if (error.message === 'MEMBER_EXISTS') {
      return 'A member with that email already exists in your gym.';
    }
    if (error.message === 'MEMBER_NOT_FOUND') {
      return 'That member no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Enqueue a CSV export of the given members (or, with no `ids`, the current
 * filtered view) and hand the `jobId` back to the table so it can surface
 * progress. The CSV is produced asynchronously and streamed API-side, so this
 * returns immediately with the job handle rather than the file.
 */
export async function bulkExportMembersAction(
  input: BulkExportMembersInput,
): Promise<ActionResult<{ jobId: string }>> {
  if (!(await requireMemberRead())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const { jobId } = await bulkExportMembers(input);
    return { ok: true, data: { jobId } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Create a member. Re-validates the body with the same Zod schema the API uses
 * (so a malformed submission fails fast, client-side of the API), enforces
 * `MemberWrite`, then refreshes the roster cache. Returns the new member's `id`
 * so the form can navigate to its detail page.
 */
export async function createMemberAction(
  input: CreateMemberInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireMemberWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid member details' };
  }
  try {
    const member = await createMember(parsed.data);
    revalidatePath('/members');
    return { ok: true, data: { id: member.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Edit a member's profile (`name` / `phone`). Enforces `MemberWrite`, re-validates
 * the body, and refreshes both the roster and the member's detail page on success.
 */
export async function updateMemberAction(
  id: string,
  input: UpdateMemberInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireMemberWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid member details' };
  }
  try {
    await updateMember(id, parsed.data);
    revalidatePath('/members');
    revalidatePath(`/members/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Deactivate (`SUSPENDED`) or reactivate (`ACTIVE`) a member. One action behind a
 * boolean keeps the two mirror-image lifecycle transitions in a single place;
 * both enforce `MemberWrite` and refresh the roster + detail caches.
 */
export async function setMemberActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ status: MemberDetail['status'] }>> {
  if (!(await requireMemberWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const member = active ? await reactivateMember(id) : await deactivateMember(id);
    revalidatePath('/members');
    revalidatePath(`/members/${id}`);
    return { ok: true, data: { status: member.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
