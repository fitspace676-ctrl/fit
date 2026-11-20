import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { fetchOrder } from '@/lib/orders';
import { PaymentResult } from '@/src/components/checkout/payment-result';

export const dynamic = 'force-dynamic';

export default async function PaymentResultPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ orderId?: string }>;
}) {
  const [{ locale }, { orderId }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  if (!orderId) notFound();
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    const from = `/${locale}/member/checkout/result?orderId=${encodeURIComponent(orderId)}`;
    redirect(`/${locale}/member/login?from=${encodeURIComponent(from)}`);
  }
  const order = await fetchOrder({ orderId, accessToken });
  if (!order) notFound();
  return <PaymentResult initialOrder={order} />;
}
