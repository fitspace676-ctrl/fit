'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  REFUND_EXCEEDS_PAID_CODE,
  refundOrderSchema,
  roleHasPermission,
} from '@fit/types';
import { ApiError, refundOrder } from '@/lib/api';
import { getServerSession } from '@/lib/session';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Re-assert a capability inside the action — defence in depth over the route gate + API guard. */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === REFUND_EXCEEDS_PAID_CODE) {
      return 'That amount is more than the order’s remaining paid balance.';
    }
    if (error.message === 'ORDER_NOT_FOUND') {
      return 'That order no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Issue a refund against an order (T7.9). Re-validates the body with the same Zod
 * schema the API uses, enforces `BillingManage` (the capability that gates the
 * refund route), and revalidates the order's pages so the new refund, the updated
 * payment, and any status change show immediately. The `422 EXCEEDS_PAID_AMOUNT`
 * is translated to a plain message rather than surfaced as a raw code.
 */
export async function refundOrderAction(
  orderId: string,
  input: { amount: number; reason: string; restockItems: boolean },
): Promise<ActionResult<{ refundId: string }>> {
  if (!(await sessionHas(Permission.BillingManage))) {
    return { ok: false, error: 'Not authorized' };
  }

  const parsed = refundOrderSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first ? first.message : 'Invalid refund' };
  }

  try {
    const { refundId } = await refundOrder(orderId, parsed.data);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath('/orders');
    return { ok: true, data: { refundId } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
