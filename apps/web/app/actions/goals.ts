'use server';

// @fit/web — member goals server action: replace the caller's goal set via
// `PUT /me/goals`, forwarding the session cookie as a bearer token.

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export interface GoalInput {
  label: string;
  current: number;
  target: number;
  unit: string;
}

export type SaveGoalsResult = { ok: true } | { ok: false; error: string; code?: string };

/** Replace the caller's whole goal set (max 8). */
export async function saveGoalsAction(goals: GoalInput[]): Promise<SaveGoalsResult> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return { ok: false, error: 'Not signed in', code: 'UNAUTHENTICATED' };
  }
  try {
    const response = await fetch(`${API_URL}/me/goals`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ goals: goals.slice(0, 8) }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      return { ok: false, error: body?.message ?? `Save failed (${response.status})`, code: body?.code };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}
