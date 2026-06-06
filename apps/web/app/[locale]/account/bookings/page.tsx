import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchMemberBookings } from '@/lib/member-bookings';
import { BookingHistory } from '@/src/components/account/BookingHistory';

/**
 * Render per request, never at build: the booking list is the signed-in
 * member's own data, read from their `accessToken` cookie, so a prerendered
 * shell would have no session to read.
 */
export const dynamic = 'force-dynamic';

interface AccountBookingsParams {
  locale: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<AccountBookingsParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account.bookings' });
  return { title: `${t('title')} — Fit` };
}

/**
 * Member panel — "My bookings" (T5.10). A Server Component that loads the
 * signed-in member's booking history and renders it split into upcoming / past.
 * The route is auth-gated by the web middleware (every non-public path requires a
 * session), so reaching this page implies a member session; the data fetch
 * forwards that session's token and degrades to an empty history if it is
 * somehow absent.
 */
export default async function AccountBookingsPage({
  params,
}: {
  params: Promise<AccountBookingsParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, entries] = await Promise.all([
    getTranslations('account.bookings'),
    fetchMemberBookings({ scope: 'all' }),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-gutter py-10">
      <header className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      <BookingHistory entries={entries} now={Date.now()} />
    </main>
  );
}
