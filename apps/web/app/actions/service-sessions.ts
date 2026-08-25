'use server';

// Book a service slot on the member's behalf: forwards the `accessToken` cookie
// as a bearer token to `POST /me/service-sessions/:id/book`. The API claims the
// slot and raises the invoice in one transaction; the result carries both.

import { cookies } from 'next/headers';
import { bookServiceSessionResultSchema, type BookServiceSessionResult } from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export async function bookServiceSessionAction(
  id: string,
): Promise<ActionResult<BookServiceSessionResult>> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return { ok: false, error: 'Sign in to book', code: 'UNAUTHENTICATED' };
  }
  const response = await fetch(`${API_URL}/me/service-sessions/${encodeURIComponent(id)}/book`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (response.ok) {
    const parsed = bookServiceSessionResultSchema.safeParse(body);
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, error: 'INVALID_RESPONSE' };
  }
  const b = (body ?? {}) as { code?: unknown; message?: unknown };
  return {
    ok: false,
    error: typeof b.message === 'string' ? b.message : `Failed to book (${response.status})`,
    code: typeof b.code === 'string' ? b.code : undefined,
  };
}
