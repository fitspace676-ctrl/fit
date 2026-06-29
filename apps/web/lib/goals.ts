// @fit/web — member goals read helper (server-only).
//
// Reads the signed-in member's training goals from `GET /me/goals`, forwarding
// the access token. Tolerant: absent session / non-OK resolves to `[]`.

import { cookies } from 'next/headers';
import type { MeGoal } from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Fetch the caller's goals, or `[]` when signed out / on any error. */
export async function fetchMyGoals({ signal }: { signal?: AbortSignal } = {}): Promise<MeGoal[]> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return [];
  }
  try {
    const response = await fetch(`${API_URL}/me/goals`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json().catch(() => null)) as { goals?: unknown } | null;
    if (!Array.isArray(body?.goals)) {
      return [];
    }
    return body.goals
      .map((g): MeGoal | null => {
        if (!g || typeof g !== 'object') return null;
        const r = g as Record<string, unknown>;
        if (
          typeof r.id !== 'string' ||
          typeof r.label !== 'string' ||
          typeof r.current !== 'number' ||
          typeof r.target !== 'number'
        ) {
          return null;
        }
        return {
          id: r.id,
          label: r.label,
          current: r.current,
          target: r.target,
          unit: typeof r.unit === 'string' ? r.unit : '',
        };
      })
      .filter((x): x is MeGoal => x !== null);
  } catch {
    return [];
  }
}
