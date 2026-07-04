// @fit/web — member notification inbox proxy (T6.10).
//
// The API access token lives in an httpOnly cookie the client can't read, so the
// notification bell can't call the backend directly. This same-origin route reads
// the cookie server-side and forwards a Bearer token to the API's inbox endpoints
// (T8.4): `GET` returns the caller's notifications + unread count for the bell,
// `POST` marks items read. Mirrors the cookie→Bearer forwarding in `lib/profile.ts`.

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** How many recent items the bell loads. The dropdown shows a compact list; the
 * unread badge count comes from the response's `unread` total, not this page. */
const INBOX_PAGE_SIZE = 20;

/** `GET /api/notifications` — the caller's recent notifications + unread count. */
export async function GET(): Promise<NextResponse> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ data: [], unread: 0 }, { status: 200 });
  }

  const response = await fetch(`${API_URL}/notifications?limit=${INBOX_PAGE_SIZE}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    return NextResponse.json({ data: [], unread: 0 }, { status: 200 });
  }

  const body = (await response.json().catch(() => null)) as unknown;
  return NextResponse.json(body ?? { data: [], unread: 0 });
}

/** `POST /api/notifications` — mark items read (body `{ ids?: string[] }`; empty
 * marks all). Returns the API's `{ updated, unread }` so the client refreshes the
 * badge without a follow-up request. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string')
    : undefined;

  const response = await fetch(`${API_URL}/notifications/mark-read`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ids ? { ids } : {}),
    cache: 'no-store',
  });
  if (!response.ok) {
    return NextResponse.json({ error: 'MARK_READ_FAILED' }, { status: 502 });
  }

  const result = (await response.json().catch(() => null)) as unknown;
  return NextResponse.json(result ?? { updated: 0, unread: 0 });
}
