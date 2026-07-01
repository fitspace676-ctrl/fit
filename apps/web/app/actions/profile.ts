'use server';

// @fit/web — profile update server action.
//
// Patches the signed-in member's profile via `PATCH /me/profile`, forwarding the
// session cookie as a bearer token. Returns a tagged result the client turns into
// a toast.

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export type UpdateProfileResult = { ok: true } | { ok: false; error: string; code?: string };

/** Patch the caller's name and/or phone. */
export async function updateProfileAction(input: {
  name?: string;
  phone?: string | null;
}): Promise<UpdateProfileResult> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return { ok: false, error: 'Not signed in', code: 'UNAUTHENTICATED' };
  }

  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) {
    payload.name = input.name;
  }
  if (input.phone !== undefined) {
    payload.phone = input.phone;
  }

  try {
    const response = await fetch(`${API_URL}/me/profile`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      return { ok: false, error: body?.message ?? `Update failed (${response.status})`, code: body?.code };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}
