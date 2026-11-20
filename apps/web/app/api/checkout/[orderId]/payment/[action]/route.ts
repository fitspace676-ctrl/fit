import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { tenantHeaders } from '@/lib/tenant-headers';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ orderId: string; action: string }>;
  },
) {
  const { orderId, action } = await params;
  if (!['sync', 'retry', 'cancel'].includes(action)) return new NextResponse(null, { status: 404 });
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ code: 'AUTH_REQUIRED' }, { status: 401 });
  try {
    const response = await fetch(
      `${API_URL}/checkout/${encodeURIComponent(orderId)}/payment/${action}`,
      {
        method: 'POST',
        headers: {
          ...(await tenantHeaders()),
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnTo: 'web' }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    );
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' }, { status: 503 });
  }
}
