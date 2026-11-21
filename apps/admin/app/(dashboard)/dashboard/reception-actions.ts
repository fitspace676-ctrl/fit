'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission, type EligibilityStatus } from '@fit/types';
import { ApiError, fetchMembers, recordCheckIn } from '@/lib/api';
import { getServerSession } from '@/lib/session';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** How many matches the desk's search shows. */
const SEARCH_LIMIT = 6;

export interface CheckInCandidate {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  planName: string | null;
}

export interface CheckInOutcome {
  name: string;
  status: EligibilityStatus;
  planName: string | null;
}

async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

/** Find members to check in — by name, email or phone. Needs `MemberRead`. */
export async function searchCheckInMembersAction(
  query: string,
): Promise<ActionResult<CheckInCandidate[]>> {
  const t = await getTranslations('admin.dashboard.reception');
  if (!(await sessionHas(Permission.MemberRead))) {
    return { ok: false, error: t('notAuthorized') };
  }
  const search = query.trim();
  if (!search) return { ok: true, data: [] };
  try {
    const { data } = await fetchMembers({ search, limit: SEARCH_LIMIT });
    return {
      ok: true,
      data: data.map((m) => ({
        id: m.id,
        name: m.name,
        phone: m.phone,
        email: m.email,
        planName: m.planName,
      })),
    };
  } catch {
    return { ok: false, error: t('searchFailed') };
  }
}

/**
 * Record a member's arrival at the desk's branch (`POST /admin/check-ins`,
 * `MemberWrite`). The API records it whatever the membership standing and hands
 * that standing back, so the desk can see at once whether to wave them through.
 */
export async function checkInMemberAction(
  gymMemberId: string,
  locationId: string | null,
): Promise<ActionResult<CheckInOutcome>> {
  const t = await getTranslations('admin.dashboard.reception');
  if (!(await sessionHas(Permission.MemberWrite))) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    const { eligibility } = await recordCheckIn({
      gymMemberId,
      method: 'MANUAL',
      ...(locationId ? { locationId } : {}),
    });
    revalidatePath('/dashboard');
    return {
      ok: true,
      data: { name: eligibility.name, status: eligibility.status, planName: eligibility.planName },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ApiError
          ? t('checkInFailedCode', { code: error.message })
          : t('checkInFailed'),
    };
  }
}
