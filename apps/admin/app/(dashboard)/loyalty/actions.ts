'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createLoyaltyRewardSchema,
  roleHasPermission,
  updateLoyaltyProgramSchema,
  updateLoyaltyRewardSchema,
  type CreateLoyaltyRewardInput,
  type LoyaltyProgramResponse,
  type LoyaltyRewardRow,
  type UpdateLoyaltyProgramInput,
  type UpdateLoyaltyRewardInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createLoyaltyReward,
  deleteLoyaltyReward,
  updateLoyaltyProgram,
  updateLoyaltyReward,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Translator for the `admin.loyalty` namespace (from `getTranslations`). */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Re-assert the Loyalty write capability inside the action itself. Middleware
 * gates `/loyalty` at RECEPTIONIST+, but writes are `LoyaltyManage` and a Server
 * Action is a POST endpoint in its own right — defence in depth ahead of the
 * API's own guards.
 */
async function requireManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.LoyaltyManage);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    switch (error.message) {
      case 'REWARD_NOT_FOUND':
        return t('errors.rewardNotFound');
      case 'MEMBER_NOT_FOUND':
        return t('errors.memberNotFound');
      default:
        return t('errors.requestFailed', { status: error.status, message: error.message });
    }
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/** Refresh the loyalty workspace after a mutation. */
function refresh(): void {
  revalidatePath('/loyalty');
}

// ── Program configuration ─────────────────────────────────────────────────────

/** Save the program config (enable toggle + earn rules); returns the saved config. */
export async function updateProgramAction(
  input: UpdateLoyaltyProgramInput,
): Promise<ActionResult<LoyaltyProgramResponse>> {
  const t = await getTranslations('admin.loyalty');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateLoyaltyProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const program = await updateLoyaltyProgram(parsed.data);
    refresh();
    return { ok: true, data: program };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

// ── Rewards catalogue (CRUD + active toggle) ──────────────────────────────────

/** Create a reward; returns the new row. */
export async function createRewardAction(
  input: CreateLoyaltyRewardInput,
): Promise<ActionResult<LoyaltyRewardRow>> {
  const t = await getTranslations('admin.loyalty');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createLoyaltyRewardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const reward = await createLoyaltyReward(parsed.data);
    refresh();
    return { ok: true, data: reward };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Edit a reward — every field optional; returns the updated row. */
export async function updateRewardAction(
  id: string,
  input: UpdateLoyaltyRewardInput,
): Promise<ActionResult<LoyaltyRewardRow>> {
  const t = await getTranslations('admin.loyalty');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateLoyaltyRewardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const reward = await updateLoyaltyReward(id, parsed.data);
    refresh();
    return { ok: true, data: reward };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Flip a reward active/inactive; returns the updated row. */
export async function toggleRewardAction(
  id: string,
  active: boolean,
): Promise<ActionResult<LoyaltyRewardRow>> {
  return updateRewardAction(id, { active });
}

/** Delete a reward. */
export async function deleteRewardAction(id: string): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.loyalty');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    await deleteLoyaltyReward(id);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
