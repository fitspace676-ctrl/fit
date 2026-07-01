import type { Metadata } from 'next';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import type { ClassInstanceCard, MemberBookingHistoryEntry, ProductSummary } from '@fit/types';
import { getActiveGymId } from '@/lib/active-gym';
import { getServerSession } from '@/lib/session';
import { fetchMemberBookings } from '@/lib/member-bookings';
import { fetchMyCreditPacks, totalRemainingCredits } from '@/lib/credit-packs';
import { fetchProducts, formatMoney } from '@/lib/shop';
import { fetchTrainers } from '@/lib/trainers';
import { fetchClassInstances } from '@/lib/classes';
import { Avatar, Badge, buttonClasses, Card, CountUp, Icon, Occupancy } from '@/src/components/ui';
import { Link } from '@/src/i18n/navigation';
import { MembershipHero } from '@/src/components/member/home/membership-hero';

export const metadata: Metadata = { title: 'Home — Fit' };

/** This is the signed-in member's own dashboard — always render per request. */
export const dynamic = 'force-dynamic';

/** Resolve a value, swallowing failures to an empty fallback so one dead upstream
 * never blanks the whole dashboard. */
async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

/** Format an ISO instant's time (HH:mm) in the active locale. */
function timeOf(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** A short, friendly day label (Today / Tomorrow / weekday) for an instant. */
function dayLabel(iso: string, locale: string, today: string, tomorrow: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayDiff = Math.round(
    (new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86_400_000,
  );
  if (dayDiff === 0) return today;
  if (dayDiff === 1) return tomorrow;
  return d.toLocaleDateString(locale, { weekday: 'short' });
}

export default async function MemberHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, activeLocale, gymId, session] = await Promise.all([
    getTranslations('member.home'),
    getLocale(),
    getActiveGymId(),
    getServerSession(),
  ]);

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  const [bookings, creditPacks, products, trainers, classes] = await Promise.all([
    safe(fetchMemberBookings({ scope: 'all' }), [] as MemberBookingHistoryEntry[]),
    safe(fetchMyCreditPacks(), []),
    gymId ? safe(fetchProducts({ gymId }), [] as ProductSummary[]) : Promise.resolve([]),
    gymId ? safe(fetchTrainers({ gymId }), []) : Promise.resolve([]),
    gymId
      ? safe(
          fetchClassInstances({ gymId, from: now.toISOString(), to: weekAhead.toISOString() }),
          [] as ClassInstanceCard[],
        )
      : Promise.resolve([] as ClassInstanceCard[]),
  ]);

  const todayLabel = t('today');
  const tomorrowLabel = t('tomorrow');

  const upcoming = bookings
    .filter((b) => b.status === 'BOOKED' || b.status === 'WAITLIST')
    .filter((b) => new Date(b.classInstance.startsAt).getTime() >= now.getTime())
    .sort(
      (a, b) =>
        new Date(a.classInstance.startsAt).getTime() - new Date(b.classInstance.startsAt).getTime(),
    );
  const nextBooking = upcoming[0] ?? null;
  const attended = bookings.filter((b) => b.status === 'ATTENDED').length;

  const credits = totalRemainingCredits(creditPacks);
  const planName = creditPacks[0]?.planTitle ?? null;
  const trainer = trainers[0] ?? null;
  const topProducts = products.slice(0, 4);
  const bookable = classes
    .slice()
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 6);

  const memberName = t('greetingFallbackName');
  const memberId = `FC-${(session?.userId ?? 'member').slice(-4).toUpperCase()}`;

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">
          {now.toLocaleDateString(activeLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('greeting')}
        </h1>
      </div>

      {/* Hero: membership + next class + stats */}
      <section className="grid gap-5 lg:grid-cols-[1.05fr_1.4fr]">
        <MembershipHero
          planName={planName}
          active={credits > 0 || planName !== null}
          daysUsed={22}
          daysTotal={30}
          creditsLeft={credits}
          memberName={memberName}
          memberId={memberId}
          qrSeed={session?.userId ?? 'guest'}
        />

        <div className="grid gap-5">
          {/* Next class */}
          <Card glow className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink-900 dark:text-white">{t('nextClass')}</p>
              {nextBooking && (
                <Badge tone="brand" icon="clock">
                  {dayLabel(
                    nextBooking.classInstance.startsAt,
                    activeLocale,
                    todayLabel,
                    tomorrowLabel,
                  )}
                </Badge>
              )}
            </div>
            {nextBooking ? (
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-card bg-ink-50 text-center dark:bg-white/5">
                  <span className="font-mono text-base font-bold text-ink-900 dark:text-white">
                    {timeOf(nextBooking.classInstance.startsAt, activeLocale)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-bold text-ink-900 dark:text-white">
                    {nextBooking.classInstance.title}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-ink-500 dark:text-ink-400">
                    {nextBooking.classInstance.trainerName} · {nextBooking.classInstance.room}
                  </p>
                  <div className="mt-2">
                    <Occupancy
                      value={nextBooking.classInstance.bookedCount}
                      cap={nextBooking.classInstance.capacity}
                    />
                  </div>
                </div>
                <Link
                  href={`/classes/${nextBooking.classInstance.id}`}
                  className={buttonClasses('primary', 'md')}
                >
                  {t('checkIn')}
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid place-items-center gap-2 py-6 text-center">
                <Icon name="calendar" className="h-8 w-8 text-ink-300 dark:text-ink-600" />
                <p className="text-sm text-ink-500 dark:text-ink-400">{t('noClasses')}</p>
                <Link href="/classes" className={buttonClasses('outline', 'sm')}>
                  {t('browseClasses')}
                </Link>
              </div>
            )}
          </Card>

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: t('dayStreak'),
                value: Math.min(attended, 30),
                icon: 'flame' as const,
                tone: 'text-flame-500',
              },
              {
                label: t('checkInsMonth'),
                value: attended,
                icon: 'spark' as const,
                tone: 'text-accent-500',
              },
              {
                label: t('classesBooked'),
                value: upcoming.length,
                icon: 'calendar' as const,
                tone: 'text-iris-500',
              },
            ].map((s) => (
              <Card key={s.label} className="p-4">
                <Icon name={s.icon} className={`h-5 w-5 ${s.tone}`} />
                <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">
                  <CountUp to={s.value} />
                </p>
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  {s.label}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Book a class */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink-900 dark:text-white">
            {t('bookClass')}
          </h2>
          <Link
            href="/classes"
            className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            {t('viewAll')}
          </Link>
        </div>
        {bookable.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {bookable.map((c) => (
              <Card key={c.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-14 shrink-0 place-items-center rounded-card bg-ink-50 text-center dark:bg-white/5">
                    <span className="font-mono text-sm font-bold text-ink-900 dark:text-white">
                      {timeOf(c.startsAt, activeLocale)}
                    </span>
                    <span className="font-mono text-[10px] text-ink-400">
                      {dayLabel(c.startsAt, activeLocale, todayLabel, tomorrowLabel)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-900 dark:text-white">{c.title}</p>
                    <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                      {c.trainerName} · {c.locationName}
                    </p>
                  </div>
                  {c.category && <Badge tone="accent">{c.category}</Badge>}
                </div>
                <Occupancy value={c.bookedCount} cap={c.capacity} />
                <Link
                  href={`/classes/${c.id}`}
                  className={buttonClasses(
                    c.bookedCount >= c.capacity ? 'outline' : 'primary',
                    'sm',
                    'w-full',
                  )}
                >
                  {c.bookedCount >= c.capacity ? t('joinWaitlist') : t('book')}
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="grid place-items-center gap-2 py-10 text-center">
            <Icon name="calendar" className="h-8 w-8 text-ink-300 dark:text-ink-600" />
            <p className="text-sm text-ink-500 dark:text-ink-400">{t('noBookable')}</p>
          </Card>
        )}
      </section>

      {/* Trainer + shop */}
      <section className="grid gap-5 lg:grid-cols-2">
        {trainer && (
          <Card glow className="p-5 sm:p-6">
            <p className="text-sm font-bold text-ink-900 dark:text-white">{t('yourTrainer')}</p>
            <div className="mt-4 flex items-center gap-4">
              <Avatar
                src={
                  trainer.avatarUrl ??
                  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(trainer.name)}`
                }
                ring
                size="h-16 w-16"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold text-ink-900 dark:text-white">
                  {trainer.name}
                </p>
                <p className="truncate text-sm text-ink-500 dark:text-ink-400">
                  {trainer.headline}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {trainer.specialties.slice(0, 3).map((s) => (
                    <Badge key={s} tone="iris">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Link
                href={`/trainers/${trainer.id}`}
                className={buttonClasses('primary', 'md', 'flex-1')}
              >
                {t('bookSession')}
              </Link>
              <Link href="/trainers" className={buttonClasses('outline', 'md')}>
                {t('viewAll')}
              </Link>
            </div>
          </Card>
        )}

        <Card glow className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-900 dark:text-white">{t('forTraining')}</p>
            <Badge tone="success">{t('membersGet')}</Badge>
          </div>
          {topProducts.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {topProducts.map((p) => (
                <Link
                  key={p.id}
                  href="/shop"
                  className="group rounded-card border border-ink-100 p-3 transition-colors hover:border-brand-300 dark:border-white/10 dark:hover:border-brand-500/50"
                >
                  <div className="aspect-square w-full overflow-hidden rounded-field bg-ink-50 dark:bg-white/5">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-2xl text-ink-300">
                        🛍️
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-ink-900 dark:text-white">
                    {p.name}
                  </p>
                  <p className="font-mono text-sm font-bold text-brand-600 dark:text-brand-300">
                    {formatMoney(p.priceAmount, p.currency, activeLocale)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-ink-500 dark:text-ink-400">{t('noProducts')}</p>
          )}
          <div className="mt-4">
            <Link href="/shop" className={buttonClasses('outline', 'sm', 'w-full')}>
              {t('visitShop')}
            </Link>
          </div>
        </Card>
      </section>

      {/* Upcoming bookings */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink-900 dark:text-white">
            {t('upcomingBookings')}
          </h2>
          <span className="text-sm text-ink-400">{upcoming.length}</span>
        </div>
        {upcoming.length > 0 ? (
          <Card className="divide-y divide-ink-100 dark:divide-white/10">
            {upcoming.slice(0, 5).map((b) => (
              <div key={b.bookingId} className="flex items-center gap-4 p-4">
                <div className="grid h-12 w-14 shrink-0 place-items-center rounded-card bg-ink-50 text-center dark:bg-white/5">
                  <span className="font-mono text-sm font-bold text-ink-900 dark:text-white">
                    {timeOf(b.classInstance.startsAt, activeLocale)}
                  </span>
                  <span className="font-mono text-[10px] text-ink-400">
                    {dayLabel(b.classInstance.startsAt, activeLocale, todayLabel, tomorrowLabel)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900 dark:text-white">
                    {b.classInstance.title}
                  </p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {b.classInstance.trainerName} · {b.classInstance.room}
                  </p>
                </div>
                <Badge tone={b.status === 'WAITLIST' ? 'warning' : 'success'}>
                  {b.status === 'WAITLIST'
                    ? t('waitlist', { position: b.waitlistPosition ?? 0 })
                    : t('confirmed')}
                </Badge>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="grid place-items-center gap-2 py-10 text-center">
            <Icon name="clock" className="h-8 w-8 text-ink-300 dark:text-ink-600" />
            <p className="text-sm text-ink-500 dark:text-ink-400">{t('noClasses')}</p>
            <Link href="/classes" className={buttonClasses('primary', 'sm')}>
              {t('browseClasses')}
            </Link>
          </Card>
        )}
      </section>
    </div>
  );
}
