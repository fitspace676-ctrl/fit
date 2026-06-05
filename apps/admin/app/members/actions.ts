'use server';

import { Permission, roleHasPermission, type BulkExportMembersInput } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, bulkExportMembers } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert `MemberRead` inside the action itself. The middleware already gates
 * the `/members` route, but a Server Action is a POST endpoint in its own right,
 * so re-checking the session's capability here keeps it safe even if the matcher
 * ever changes — defence in depth, not a substitute for the gate. (The API
 * re-checks again behind its own guards.)
 */
async function requireMemberRead(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.MemberRead);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Export failed (${error.status}): ${error.message}`;
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
