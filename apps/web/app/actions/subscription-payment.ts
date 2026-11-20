'use server';

import { cookies } from 'next/headers';
import { paymentActionSchema, type PaySubscriptionResponse } from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { tenantHeaders } from '@/lib/tenant-headers';

export async function paySubscriptionAction(): Promise<
  { ok: true; data: PaySubscriptionResponse } | { ok: false; code?: string }
> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return { ok: false, code: 'UNAUTHENTICATED' };
  try {
    const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    const response = await fetch(`${base}/me/subscription/pay`, {
      method: 'POST',
      headers: {
        ...(await tenantHeaders()),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ returnTo: 'web' }),
      cache: 'no-store',
    });
    const body = (await response.json()) as { payment?: unknown; code?: string };
    const parsed = paymentActionSchema.safeParse(body.payment);
    if (response.status === 201 && parsed.success) {
      return { ok: true, data: { payment: parsed.data } };
    }
    return { ok: false, code: body.code };
  } catch {
    return { ok: false };
  }
}
