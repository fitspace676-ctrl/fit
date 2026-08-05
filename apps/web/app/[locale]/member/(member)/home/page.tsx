import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import type { ClassInstanceCard, MemberBookingHistoryEntry, ProductSummary } from '@fit/types';
import { getActiveGymId } from '@/lib/active-gym';
import { getServerSession } from '@/lib/session';
import { fetchMemberBookings } from '@/lib/member-bookings';
import { fetchMyCreditPacks, totalRemainingCredits } from '@/lib/credit-packs';
import { fetchProducts, formatMoney } from '@/lib/shop';
import { fetchTrainers } from '@/lib/trainers';
import { fetchClassInstances } from '@/lib/classes';
import { ButtonLink, CountUp, Icon } from '@/src/components/ui';
import { Link } from '@/src/i18n/navigation';
import { MembershipHero } from '@/src/components/member/home/membership-hero';

export const metadata: Metadata = { title: 'Home — Fit' };

/** This is the signed-in member's own dashboard — always render per request. */
export const dynamic = 'force-dynamic';

// Astryx migration (T11.11): the member dashboard is rebuilt on Astryx
// `Card` / `Button` / `Badge` / `Avatar` over the Fit brand theme tokens, with
// all layout and the small data-viz bits (time chips, occupancy meter) authored
// in compiled StyleX (`var(--color-*)` / `var(--font-family-*)`) — no Tailwind
// utilities and no formacore Aurora-glass primitives. The data fetching below is
// unchanged; only the presentation moved off Tailwind.

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  eyebrow: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
    color: 'var(--color-text-secondary)',
  },
  greeting: {
    marginTop: '0.25rem',
    marginBottom: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  heroGrid: {
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '1.05fr 1.4fr',
    },
  },
  col: {
    display: 'grid',
    gap: '1.25rem',
    alignContent: 'start',
  },
  card: {
    padding: '1.25rem',
  },
  cardLg: {
    padding: '1.5rem',
  },
  rowBetween: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  cardLabel: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  nextRow: {
    marginTop: '1rem',
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'center',
    },
    gap: '1rem',
  },
  timeBox: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    height: '4rem',
    width: '4rem',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    textAlign: 'center',
  },
  timeBoxSm: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    height: '3rem',
    width: '3.5rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    textAlign: 'center',
  },
  timeText: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  timeTextSm: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  daySub: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  grow: {
    minWidth: 0,
    flex: 1,
  },
  itemTitle: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  itemTitleSm: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  itemSub: {
    margin: 0,
    marginTop: '0.125rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  itemSubXs: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  empty: {
    marginTop: '1rem',
    display: 'grid',
    placeItems: 'center',
    gap: '0.5rem',
    paddingBlock: '1.5rem',
    textAlign: 'center',
  },
  emptyLg: {
    display: 'grid',
    placeItems: 'center',
    gap: '0.5rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
  },
  emptyText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  mutedIcon: {
    width: '2rem',
    height: '2rem',
    color: 'var(--color-text-disabled)',
  },
  statStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '0.75rem',
  },
  statValue: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  statLabel: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-text-secondary)',
  },
  statIcon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  sectionTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  sectionHead: {
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  viewAll: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    textDecoration: {
      default: 'none',
      ':hover': 'underline',
    },
  },
  count: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  bookableGrid: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1280px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  classCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1rem',
  },
  classTop: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  twoCol: {
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  trainerRow: {
    marginTop: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  avatarRing: {
    boxShadow: '0 0 0 2px var(--color-background-card), 0 0 0 4px var(--color-accent)',
  },
  specialties: {
    marginTop: '0.5rem',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  actionRow: {
    marginTop: '1.25rem',
    display: 'flex',
    gap: '0.5rem',
  },
  fullBtn: {
    width: '100%',
  },
  flexBtn: {
    flex: 1,
  },
  productGrid: {
    marginTop: '1rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.75rem',
  },
  productCard: {
    display: 'block',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-accent)',
    },
    padding: '0.75rem',
    textDecoration: 'none',
    transitionProperty: 'border-color',
    transitionDuration: '150ms',
  },
  productThumb: {
    aspectRatio: '1 / 1',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    display: 'grid',
    placeItems: 'center',
  },
  productImg: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
  productEmoji: {
    fontSize: '1.5rem',
  },
  productName: {
    margin: 0,
    marginTop: '0.5rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  productPrice: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-accent)',
  },
  productEmpty: {
    marginTop: '1.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  listRowFirst: {
    borderTopWidth: 0,
  },
  occ: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  occHead: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  occValue: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.125rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  occCap: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  occPct: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  occTrack: {
    height: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  occFill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
  },
  occFillOk: { backgroundColor: 'var(--color-success)' },
  occFillWarn: { backgroundColor: 'var(--color-warning)' },
  occFillFull: { backgroundColor: 'var(--color-error)' },
  brandIcon: { color: 'var(--color-text-accent)' },
  badgeIcon: { width: '0.875rem', height: '0.875rem' },
});

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

/** A "value / cap" header over a fill bar, colour-coded by how full it is —
 * rebuilt on the Astryx brand tokens (success → warning → error). */
function OccupancyBar({ value, cap }: { value: number; cap: number }) {
  const pct = cap > 0 ? Math.round((value / cap) * 100) : 0;
  const fill = pct > 85 ? styles.occFillFull : pct > 60 ? styles.occFillWarn : styles.occFillOk;
  return (
    <div {...stylex.props(styles.occ)}>
      <div {...stylex.props(styles.occHead)}>
        <p {...stylex.props(styles.occValue)}>
          {value}
          <span {...stylex.props(styles.occCap)}>/{cap}</span>
        </p>
        <span {...stylex.props(styles.occPct)}>{pct}%</span>
      </div>
      <div {...stylex.props(styles.occTrack)}>
        <div {...stylex.props(styles.occFill, fill)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
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

  const stats = [
    { label: t('dayStreak'), value: Math.min(attended, 30), icon: 'flame' as const },
    { label: t('checkInsMonth'), value: attended, icon: 'qr' as const },
    { label: t('classesBooked'), value: upcoming.length, icon: 'calendar' as const },
  ];

  return (
    <div {...stylex.props(styles.page)}>
      {/* Greeting */}
      <div>
        <p {...stylex.props(styles.eyebrow)}>
          {now.toLocaleDateString(activeLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 {...stylex.props(styles.greeting)}>{t('greeting')}</h1>
      </div>

      {/* Hero: membership + next class + stats */}
      <section {...stylex.props(styles.heroGrid)}>
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

        <div {...stylex.props(styles.col)}>
          {/* Next class */}
          <Card variant="default" padding={0} xstyle={styles.card}>
            <div {...stylex.props(styles.rowBetween)}>
              <p {...stylex.props(styles.cardLabel)}>{t('nextClass')}</p>
              {nextBooking && (
                <Badge
                  variant="purple"
                  icon={<Icon name="clock" {...stylex.props(styles.badgeIcon)} />}
                  label={dayLabel(
                    nextBooking.classInstance.startsAt,
                    activeLocale,
                    todayLabel,
                    tomorrowLabel,
                  )}
                />
              )}
            </div>
            {nextBooking ? (
              <div {...stylex.props(styles.nextRow)}>
                <div {...stylex.props(styles.timeBox)}>
                  <span {...stylex.props(styles.timeText)}>
                    {timeOf(nextBooking.classInstance.startsAt, activeLocale)}
                  </span>
                </div>
                <div {...stylex.props(styles.grow)}>
                  <p {...stylex.props(styles.itemTitle)}>{nextBooking.classInstance.title}</p>
                  <p {...stylex.props(styles.itemSub)}>
                    {nextBooking.classInstance.trainerName} · {nextBooking.classInstance.room}
                  </p>
                  <div style={{ marginTop: '0.5rem' }}>
                    <OccupancyBar
                      value={nextBooking.classInstance.bookedCount}
                      cap={nextBooking.classInstance.capacity}
                    />
                  </div>
                </div>
                <ButtonLink
                  href={`/member/classes/${nextBooking.classInstance.id}`}
                  variant="primary"
                  size="md"
                  label={t('checkIn')}
                />
              </div>
            ) : (
              <div {...stylex.props(styles.empty)}>
                <Icon name="calendar" {...stylex.props(styles.mutedIcon)} />
                <p {...stylex.props(styles.emptyText)}>{t('noClasses')}</p>
                <ButtonLink
                  href="/member/classes"
                  variant="secondary"
                  size="sm"
                  label={t('browseClasses')}
                />
              </div>
            )}
          </Card>

          {/* Stat strip */}
          <div {...stylex.props(styles.statStrip)}>
            {stats.map((s) => (
              <Card key={s.label} variant="default" padding={0} xstyle={styles.card}>
                <Icon name={s.icon} {...stylex.props(styles.statIcon, styles.brandIcon)} />
                <p {...stylex.props(styles.statValue)}>
                  <CountUp to={s.value} />
                </p>
                <p {...stylex.props(styles.statLabel)}>{s.label}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Book a class */}
      <section>
        <div {...stylex.props(styles.sectionHead)}>
          <h2 {...stylex.props(styles.sectionTitle)}>{t('bookClass')}</h2>
          <Link href="/member/classes" {...stylex.props(styles.viewAll)}>
            {t('viewAll')}
          </Link>
        </div>
        {bookable.length > 0 ? (
          <div {...stylex.props(styles.bookableGrid)}>
            {bookable.map((c) => {
              const full = c.bookedCount >= c.capacity;
              return (
                <Card key={c.id} variant="default" padding={0} xstyle={styles.classCard}>
                  <div {...stylex.props(styles.classTop)}>
                    <div {...stylex.props(styles.timeBoxSm)}>
                      <span {...stylex.props(styles.timeTextSm)}>
                        {timeOf(c.startsAt, activeLocale)}
                      </span>
                      <span {...stylex.props(styles.daySub)}>
                        {dayLabel(c.startsAt, activeLocale, todayLabel, tomorrowLabel)}
                      </span>
                    </div>
                    <div {...stylex.props(styles.grow)}>
                      <p {...stylex.props(styles.itemTitleSm)}>{c.title}</p>
                      <p {...stylex.props(styles.itemSubXs)}>
                        {c.trainerName} · {c.locationName}
                      </p>
                    </div>
                    {c.category && <Badge variant="blue" label={c.category} />}
                  </div>
                  <OccupancyBar value={c.bookedCount} cap={c.capacity} />
                  <ButtonLink
                    href={`/member/classes/${c.id}`}
                    variant={full ? 'secondary' : 'primary'}
                    size="sm"
                    label={full ? t('joinWaitlist') : t('book')}
                    xstyle={styles.fullBtn}
                  />
                </Card>
              );
            })}
          </div>
        ) : (
          <Card variant="default" padding={0} xstyle={styles.emptyLg}>
            <Icon name="calendar" {...stylex.props(styles.mutedIcon)} />
            <p {...stylex.props(styles.emptyText)}>{t('noBookable')}</p>
          </Card>
        )}
      </section>

      {/* Trainer + shop */}
      <section {...stylex.props(styles.twoCol)}>
        {trainer && (
          <Card variant="default" padding={0} xstyle={styles.cardLg}>
            <p {...stylex.props(styles.cardLabel)}>{t('yourTrainer')}</p>
            <div {...stylex.props(styles.trainerRow)}>
              <Avatar
                src={trainer.avatarUrl ?? undefined}
                name={trainer.name}
                size={64}
                xstyle={styles.avatarRing}
              />
              <div {...stylex.props(styles.grow)}>
                <p {...stylex.props(styles.itemTitle)}>{trainer.name}</p>
                <p {...stylex.props(styles.itemSub)}>{trainer.headline}</p>
                <div {...stylex.props(styles.specialties)}>
                  {trainer.specialties.slice(0, 3).map((s) => (
                    <Badge key={s} variant="purple" label={s} />
                  ))}
                </div>
              </div>
            </div>
            <div {...stylex.props(styles.actionRow)}>
              <ButtonLink
                href={`/member/trainers/${trainer.id}`}
                variant="primary"
                size="md"
                label={t('bookSession')}
                xstyle={styles.flexBtn}
              />
              <ButtonLink
                href="/member/trainers"
                variant="secondary"
                size="md"
                label={t('viewAll')}
              />
            </div>
          </Card>
        )}

        <Card variant="default" padding={0} xstyle={styles.cardLg}>
          <div {...stylex.props(styles.rowBetween)}>
            <p {...stylex.props(styles.cardLabel)}>{t('forTraining')}</p>
            <Badge variant="success" label={t('membersGet')} />
          </div>
          {topProducts.length > 0 ? (
            <div {...stylex.props(styles.productGrid)}>
              {topProducts.map((p) => (
                <Link key={p.id} href="/member/shop" {...stylex.props(styles.productCard)}>
                  <div {...stylex.props(styles.productThumb)}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" {...stylex.props(styles.productImg)} />
                    ) : (
                      <span {...stylex.props(styles.productEmoji)}>🛍️</span>
                    )}
                  </div>
                  <p {...stylex.props(styles.productName)}>{p.name}</p>
                  <p {...stylex.props(styles.productPrice)}>
                    {formatMoney(p.priceAmount, p.currency, activeLocale)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p {...stylex.props(styles.productEmpty)}>{t('noProducts')}</p>
          )}
          <div style={{ marginTop: '1rem' }}>
            <ButtonLink
              href="/member/shop"
              variant="secondary"
              size="sm"
              label={t('visitShop')}
              xstyle={styles.fullBtn}
            />
          </div>
        </Card>
      </section>

      {/* Upcoming bookings */}
      <section>
        <div {...stylex.props(styles.sectionHead)}>
          <h2 {...stylex.props(styles.sectionTitle)}>{t('upcomingBookings')}</h2>
          <span {...stylex.props(styles.count)}>{upcoming.length}</span>
        </div>
        {upcoming.length > 0 ? (
          <Card variant="default" padding={0} xstyle={styles.listCard}>
            {upcoming.slice(0, 5).map((b, i) => (
              <div
                key={b.bookingId}
                {...stylex.props(styles.listRow, i === 0 && styles.listRowFirst)}
              >
                <div {...stylex.props(styles.timeBoxSm)}>
                  <span {...stylex.props(styles.timeTextSm)}>
                    {timeOf(b.classInstance.startsAt, activeLocale)}
                  </span>
                  <span {...stylex.props(styles.daySub)}>
                    {dayLabel(b.classInstance.startsAt, activeLocale, todayLabel, tomorrowLabel)}
                  </span>
                </div>
                <div {...stylex.props(styles.grow)}>
                  <p {...stylex.props(styles.itemTitleSm)}>{b.classInstance.title}</p>
                  <p {...stylex.props(styles.itemSubXs)}>
                    {b.classInstance.trainerName} · {b.classInstance.room}
                  </p>
                </div>
                <Badge
                  variant={b.status === 'WAITLIST' ? 'warning' : 'success'}
                  label={
                    b.status === 'WAITLIST'
                      ? t('waitlist', { position: b.waitlistPosition ?? 0 })
                      : t('confirmed')
                  }
                />
              </div>
            ))}
          </Card>
        ) : (
          <Card variant="default" padding={0} xstyle={styles.emptyLg}>
            <Icon name="clock" {...stylex.props(styles.mutedIcon)} />
            <p {...stylex.props(styles.emptyText)}>{t('noClasses')}</p>
            <ButtonLink
              href="/member/classes"
              variant="primary"
              size="sm"
              label={t('browseClasses')}
            />
          </Card>
        )}
      </section>
    </div>
  );
}
