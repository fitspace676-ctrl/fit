// @fit/web — member profile read helper (server-only).
//
// Reads the signed-in member's profile from `GET /me/profile`, forwarding the
// access token as a bearer. Tolerant: an absent session / non-OK resolves to
// `null`, so the Profile screen falls back to placeholders.

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export interface MemberProfile {
  userId: string;
  name: string | null;
  email: string;
  phone: string | null;
}

/** Fetch the caller's profile, or `null` when signed out / on any error. */
export async function fetchMyProfile({
  signal,
}: { signal?: AbortSignal } = {}): Promise<MemberProfile | null> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return null;
  }
  try {
    const response = await fetch(`${API_URL}/me/profile`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json().catch(() => null)) as { profile?: unknown } | null;
    const p = body?.profile;
    if (!p || typeof p !== 'object') {
      return null;
    }
    const r = p as Record<string, unknown>;
    if (typeof r.userId !== 'string' || typeof r.email !== 'string') {
      return null;
    }
    return {
      userId: r.userId,
      name: typeof r.name === 'string' ? r.name : null,
      email: r.email,
      phone: typeof r.phone === 'string' ? r.phone : null,
    };
  } catch {
    return null;
  }
}
