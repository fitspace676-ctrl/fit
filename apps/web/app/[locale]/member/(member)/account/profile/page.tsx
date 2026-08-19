import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { MemberBookingHistoryEntry } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { fetchMemberBookings } from '@/lib/member-bookings';
import { fetchMyCreditPacks, totalRemainingCredits } from '@/lib/credit-packs';
import { fetchMyProfile } from '@/lib/profile';
import { ProfileScreen } from '@/src/components/member/profile/profile-screen';

export const metadata: Metadata = { title: 'Profile - FormaCore' };
export const dynamic = 'force-dynamic';

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, session, bookings, creditPacks, profile] = await Promise.all([
    getTranslations('member.profile'),
    getServerSession(),
    safe(fetchMemberBookings({ scope: 'all' }), [] as MemberBookingHistoryEntry[]),
    safe(fetchMyCreditPacks(), []),
    safe(fetchMyProfile(), null),
  ]);

  const attended = bookings.filter((b) => b.status === 'ATTENDED').length;
  const memberId = `FC-${(session?.userId ?? 'member').slice(-4).toUpperCase()}`;

  return (
    <ProfileScreen
      name={profile?.name ?? t('namePlaceholder')}
      email={profile?.email ?? t('emailPlaceholder')}
      phone={profile?.phone ?? ''}
      memberId={memberId}
      attended={attended}
      credits={totalRemainingCredits(creditPacks)}
    />
  );
}
