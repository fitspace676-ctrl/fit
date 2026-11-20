'use client';
import { formatZoned } from './date-utils';
import type { MemberBookingStanding } from '@fit/types';
import { useLocale, useTranslations } from 'next-intl';
import { Banner } from '@/src/components/ui/kit';
export function BookingStandingNotice({ standing, timeZone, history = false }: { standing?: MemberBookingStanding | null; timeZone: string; history?: boolean }) {
  const t = useTranslations('member.actions');
  const locale = useLocale();
  if (!standing) return null;
  if (standing.block) return <Banner tone="error">{t('errBookingBlocked', { date: formatZoned(standing.block.until, timeZone, locale, { day: 'numeric', month: 'long', year: 'numeric' }), count: standing.noShow.limit })}</Banner>;
  const rule = standing.noShow;
  if (!rule.active) return null;
  if (rule.remaining === 1) return <Banner tone="info">{t('bookingWarning', { days: rule.blockDays })}</Banner>;
  return history && rule.count > 0 && rule.remaining !== null && rule.remaining > 1 ? <p>{t('bookingStrikes', { count: rule.count, limit: rule.limit, days: rule.windowDays })}</p> : null;
}
