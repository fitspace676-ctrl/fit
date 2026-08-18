import type { Metadata } from 'next';
import { Avatar, Badge, ButtonLink, Card, CountUp, Meter } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import type { ClassInstanceCard, MemberBookingHistoryEntry, ProductSummary } from '@fit/types';
import { getActiveGymId, getActiveGymTimezone } from '@/lib/active-gym';
import { getServerSession } from '@/lib/session';
import { fetchMemberBookings } from '@/lib/member-bookings';
import { fetchMyCreditPacks, totalRemainingCredits } from '@/lib/credit-packs';
import { fetchMembership, type MemberSubscription } from '@/lib/membership';
import { fetchProducts, formatMoney } from '@/lib/shop';
import { fetchTrainers } from '@/lib/trainers';
import { fetchClassInstances } from '@/lib/classes';
import { Icon } from '@/src/components/ui';
import { Link } from '@/src/i18n/navigation';
import { MembershipHero } from '@/src/components/member/home/membership-hero';
import { CheckInQr } from '@/src/components/member/home/check-in-qr';
import {
  formatZoned,
  formatZonedTime,
  zonedRelativeDay,
} from '@/src/components/classes/date-utils';

export const metadata: Metadata = { title: 'Home - FormaCore' };

/** This is the signed-in member's own dashboard — always render per request. */
export const dynamic = 'force-dynamic';

// Astryx migration (T11), now on the portal kit: the member dashboard is rebuilt on the portal kit
// `Card` / `Button` / `Badge` / `Avatar` over the FormaCore theme tokens, with
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
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.18em',
    color: 'var(--color-text-secondary)',
  },
  greetingRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1.25rem',
  },
  greetingText: {
    minWidth: 0,
  },
  greeting: {
    marginTop: '0.75rem',
    marginBottom: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: {
      default: '1.875rem',
      '@media (min-width: 640px)': '2.375rem',
    },
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: '-0.025em',
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
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.375rem',
    fontWeight: 800,
    letterSpacing: '-0.025em',
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
  // The 64px duration tile from the artboards' class card — a bordered inset
  // square holding a mono minute count over a "min" caption.
  timeBox: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    height: '4rem',
    width: '4rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-tile)',
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
    fontSize: '1.0625rem',
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
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
    marginTop: '0.125rem',
    fontSize: '0.625rem',
    fontWeight: 600,
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
    fontSize: '1.5rem',
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: '-0.025em',
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
  // The counters are the direction's signature move at tile scale: a cropped
  // mono numeral doing the work an icon would do elsewhere. 28px on phones,
  // 32px from `sm` — big enough to read as a graphic, not as body copy.
  statValue: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: {
      default: '1.75rem',
      '@media (min-width: 640px)': '2rem',
    },
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  // The `/3` half of a `2/3` credit balance — same face, smaller and quieter,
  // so the numeral that matters still reads as the graphic.
  statSub: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  statLabel: {
    margin: 0,
    marginTop: '0.75rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: {
      default: 'normal',
      '@media (min-width: 640px)': '0.14em',
    },
    color: 'var(--color-text-secondary)',
  },
  statIcon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  sectionTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.625rem',
    fontWeight: 800,
    letterSpacing: '-0.025em',
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
    padding: {
      default: '1.25rem',
      '@media (min-width: 640px)': '1.5rem',
    },
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
  // The image-less fallback: the product's initial set in mono, the way the
  // artboards draw a product with no photo (W / T / R / S). It replaced a 🛍️
  // emoji — the direction bans emoji outright, and a colour-font glyph was the
  // single most saturated thing on an otherwise monochrome page.
  productInitial: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.75rem',
    fontWeight: 700,
    letterSpacing: '-0.04em',
    color: 'var(--color-text-disabled)',
    userSelect: 'none',
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

// Class times on this page are read in the GYM's zone, like every other screen
// that prints one.
//
// They were the exception. `#304` moved the classes browser, the class detail,
// the trainer schedule and the bookings board onto `formatZonedTime`, but the
// dashboard kept formatting through `createDateTimeFormat` — a reporting-layer
// formatter whose own docstring says it reads UTC and that any other zone is a
// bug at the call site. So a class the gym runs at 12:00 was labelled 08:00 here
// and 12:00 one click away on `/member/classes`: the same booking, two times,
// with nothing on screen to say which was real.
//
// A class is a wall-clock commitment AT the gym — "Monday 18:00 at Main Floor"
// is the same appointment whether it is read in Tbilisi or from a phone in
// Berlin — so the stored instant only becomes that wall clock in the gym's zone.

/**
 * Statuses that mean "this member currently has a plan". `PAST_DUE` counts: the
 * plan is live and the member can still train — what is wrong is the payment,
 * which the membership screen surfaces. `CANCELED` counts too while the period
 * has not lapsed, because a cancelled-but-unexpired plan is still in force; the
 * period check in {@link billingPeriodProgress} is what ends it.
 */
const ACTIVE_STATUSES = new Set(['ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELED']);

/**
 * How far through the current billing period the member is, for the membership
 * block's progress bar. Returns zeroes when there is no dated period — the block
 * hides the bar entirely rather than drawing an invented one.
 *
 * This replaced a hardcoded `22 / 30`, which rendered the same 73% bar for every
 * member on every plan regardless of when they actually renewed.
 */
function billingPeriodProgress(
  subscription: MemberSubscription | null,
  now: Date,
): { daysUsed: number; daysTotal: number } {
  const start = subscription?.currentPeriodStart;
  const end = subscription?.currentPeriodEnd;
  if (!start || !end) {
    return { daysUsed: 0, daysTotal: 0 };
  }

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { daysUsed: 0, daysTotal: 0 };
  }

  const day = 86_400_000;
  const daysTotal = Math.max(1, Math.round((endMs - startMs) / day));
  const elapsed = Math.round((now.getTime() - startMs) / day);
  return { daysUsed: Math.min(daysTotal, Math.max(0, elapsed)), daysTotal };
}

export default async function MemberHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, activeLocale, gymId, timeZone, session] = await Promise.all([
    getTranslations('member.home'),
    getLocale(),
    getActiveGymId(),
    getActiveGymTimezone(),
    getServerSession(),
  ]);

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  const [bookings, creditPacks, membership, products, trainers, classes] = await Promise.all([
    safe(fetchMemberBookings({ scope: 'all' }), [] as MemberBookingHistoryEntry[]),
    safe(fetchMyCreditPacks(), []),
    // The dashboard's flagship card states the member's PLAN, so it has to read
    // the subscription — same `GET /me/subscription` the membership screen uses.
    safe(fetchMembership(), { subscription: null, invoices: [] }),
    gymId ? safe(fetchProducts({ gymId }), [] as ProductSummary[]) : Promise.resolve([]),
    gymId ? safe(fetchTrainers({ gymId }), []) : Promise.resolve([]),
    gymId
      ? safe(
          fetchClassInstances({ gymId, from: now.toISOString(), to: weekAhead.toISOString() }),
          [] as ClassInstanceCard[],
        )
      : Promise.resolve([] as ClassInstanceCard[]),
  ]);

  const dayLabels = { today: t('today'), tomorrow: t('tomorrow') };

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

  // The membership block reads the live subscription. It used to take its plan
  // name from `creditPacks[0].planTitle` — a PT credit pack, not a membership —
  // so a member on Premium with no packs saw "no plan" on their dashboard while
  // the membership screen showed Premium, and a member with packs but no
  // subscription saw the pack's title billed as their plan. The credit-pack
  // title stays as the fallback for exactly that second case (packs are a
  // standalone product a non-subscriber can hold).
  const subscription = membership.subscription;
  const planName = subscription?.planName ?? creditPacks[0]?.planTitle ?? null;
  const hasPlan = Boolean(subscription && ACTIVE_STATUSES.has(subscription.status));
  const { daysUsed, daysTotal } = billingPeriodProgress(subscription, now);

  const trainer = trainers[0] ?? null;
  const topProducts = products.slice(0, 4);
  const bookable = classes
    .slice()
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 6);

  const memberName = t('greetingFallbackName');
  const memberId = `FC-${(session?.userId ?? 'member').slice(-4).toUpperCase()}`;

  // The artboards' three counters. The third is PT credits rather than a
  // booking count — upcoming bookings already have their own section below, and
  // credits are the one balance the dashboard does not otherwise state. It
  // carries the `remaining/total` sub-notation the artboards draw, summed across
  // every active pack.
  const creditsTotal = creditPacks.reduce((sum, pack) => sum + pack.totalCredits, 0);
  const stats = [
    { label: t('dayStreak'), value: Math.min(attended, 30), sub: null, icon: 'flame' as const },
    { label: t('checkInsMonth'), value: attended, sub: null, icon: 'qr' as const },
    {
      label: t('ptCredits'),
      value: credits,
      sub: creditsTotal > 0 ? `/${creditsTotal}` : null,
      icon: 'dumbbell' as const,
    },
  ];

  return (
    <div {...stylex.props(styles.page)}>
      {/* Greeting — paired with the check-in button, which the artboards put
          here rather than inside the membership block: showing your code at the
          door is the first thing a member does on arrival. */}
      <div {...stylex.props(styles.greetingRow)}>
        <div {...stylex.props(styles.greetingText)}>
          <p {...stylex.props(styles.eyebrow)}>
            {formatZoned(now.toISOString(), timeZone, activeLocale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1 {...stylex.props(styles.greeting)}>{t('greeting')}</h1>
        </div>
        <CheckInQr
          memberName={memberName}
          memberId={memberId}
          qrSeed={session?.userId ?? 'guest'}
          active={hasPlan}
        />
      </div>

      {/* Hero: membership + next class + stats */}
      <section {...stylex.props(styles.heroGrid)}>
        <MembershipHero
          planName={planName}
          active={hasPlan || credits > 0}
          daysUsed={daysUsed}
          daysTotal={daysTotal}
          memberName={memberName}
          memberId={memberId}
        />

        <div {...stylex.props(styles.col)}>
          {/* Next class */}
          <Card padding="none" xstyle={styles.card}>
            <div {...stylex.props(styles.rowBetween)}>
              <p {...stylex.props(styles.cardLabel)}>{t('nextClass')}</p>
              {nextBooking && (
                <Badge
                  tone="neutral"
                  icon={<Icon name="clock" {...stylex.props(styles.badgeIcon)} />}
                  label={zonedRelativeDay(
                    nextBooking.classInstance.startsAt,
                    now,
                    timeZone,
                    activeLocale,
                    dayLabels,
                  )}
                />
              )}
            </div>
            {nextBooking ? (
              <div {...stylex.props(styles.nextRow)}>
                <div {...stylex.props(styles.timeBox)}>
                  <span {...stylex.props(styles.timeText)}>
                    {formatZonedTime(nextBooking.classInstance.startsAt, timeZone)}
                  </span>
                </div>
                <div {...stylex.props(styles.grow)}>
                  <p {...stylex.props(styles.itemTitle)}>{nextBooking.classInstance.title}</p>
                  <p {...stylex.props(styles.itemSub)}>
                    {nextBooking.classInstance.trainerName} · {nextBooking.classInstance.room}
                  </p>
                  <div style={{ marginTop: '0.5rem' }}>
                    <Meter
                      value={nextBooking.classInstance.bookedCount}
                      max={nextBooking.classInstance.capacity}
                      label={t('spotsTaken')}
                    />
                  </div>
                </div>
                <ButtonLink
                  href={`/member/classes/${nextBooking.classInstance.id}`}
                  variant="primary"
                  size="card"
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
                  size="inline"
                  label={t('browseClasses')}
                />
              </div>
            )}
          </Card>

          {/* Stat strip */}
          <div {...stylex.props(styles.statStrip)}>
            {stats.map((s) => (
              <Card key={s.label} padding="none" xstyle={styles.card}>
                <Icon name={s.icon} {...stylex.props(styles.statIcon, styles.brandIcon)} />
                <p {...stylex.props(styles.statValue)}>
                  <CountUp to={s.value} />
                  {s.sub ? <span {...stylex.props(styles.statSub)}>{s.sub}</span> : null}
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
                <Card key={c.id} padding="none" xstyle={styles.classCard}>
                  <div {...stylex.props(styles.classTop)}>
                    <div {...stylex.props(styles.timeBoxSm)}>
                      <span {...stylex.props(styles.timeTextSm)}>
                        {formatZonedTime(c.startsAt, timeZone)}
                      </span>
                      <span {...stylex.props(styles.daySub)}>
                        {zonedRelativeDay(c.startsAt, now, timeZone, activeLocale, dayLabels)}
                      </span>
                    </div>
                    <div {...stylex.props(styles.grow)}>
                      <p {...stylex.props(styles.itemTitleSm)}>{c.title}</p>
                      <p {...stylex.props(styles.itemSubXs)}>
                        {c.trainerName} · {c.locationName}
                      </p>
                    </div>
                    {c.category && <Badge tone="neutral" label={c.category} />}
                  </div>
                  <Meter value={c.bookedCount} max={c.capacity} label={t('spotsTaken')} />
                  <ButtonLink
                    href={`/member/classes/${c.id}`}
                    variant={full ? 'secondary' : 'primary'}
                    size="card"
                    label={full ? t('joinWaitlist') : t('book')}
                    fullWidth
                  />
                </Card>
              );
            })}
          </div>
        ) : (
          <Card padding="none" xstyle={styles.emptyLg}>
            <Icon name="calendar" {...stylex.props(styles.mutedIcon)} />
            <p {...stylex.props(styles.emptyText)}>{t('noBookable')}</p>
          </Card>
        )}
      </section>

      {/* Trainer + shop */}
      <section {...stylex.props(styles.twoCol)}>
        {trainer && (
          <Card padding="none" xstyle={styles.cardLg}>
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
                    <Badge key={s} tone="neutral" label={s} />
                  ))}
                </div>
              </div>
            </div>
            <div {...stylex.props(styles.actionRow)}>
              <ButtonLink
                href={`/member/trainers/${trainer.id}`}
                variant="primary"
                size="block"
                label={t('bookSession')}
                xstyle={styles.flexBtn}
              />
              <ButtonLink
                href="/member/trainers"
                variant="secondary"
                size="block"
                label={t('viewAll')}
              />
            </div>
          </Card>
        )}

        <Card padding="none" xstyle={styles.cardLg}>
          <div {...stylex.props(styles.rowBetween)}>
            <p {...stylex.props(styles.cardLabel)}>{t('forTraining')}</p>
            <Badge tone="positive" label={t('membersGet')} />
          </div>
          {topProducts.length > 0 ? (
            <div {...stylex.props(styles.productGrid)}>
              {topProducts.map((p) => (
                <Link key={p.id} href="/member/shop" {...stylex.props(styles.productCard)}>
                  <div {...stylex.props(styles.productThumb)}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" {...stylex.props(styles.productImg)} />
                    ) : (
                      <span aria-hidden {...stylex.props(styles.productInitial)}>
                        {p.name.trim().charAt(0).toUpperCase()}
                      </span>
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
              size="card"
              label={t('visitShop')}
              fullWidth
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
          <Card padding="none" xstyle={styles.listCard}>
            {upcoming.slice(0, 5).map((b, i) => (
              <div
                key={b.bookingId}
                {...stylex.props(styles.listRow, i === 0 && styles.listRowFirst)}
              >
                <div {...stylex.props(styles.timeBoxSm)}>
                  <span {...stylex.props(styles.timeTextSm)}>
                    {formatZonedTime(b.classInstance.startsAt, timeZone)}
                  </span>
                  <span {...stylex.props(styles.daySub)}>
                    {zonedRelativeDay(
                      b.classInstance.startsAt,
                      now,
                      timeZone,
                      activeLocale,
                      dayLabels,
                    )}
                  </span>
                </div>
                <div {...stylex.props(styles.grow)}>
                  <p {...stylex.props(styles.itemTitleSm)}>{b.classInstance.title}</p>
                  <p {...stylex.props(styles.itemSubXs)}>
                    {b.classInstance.trainerName} · {b.classInstance.room}
                  </p>
                </div>
                <Badge
                  tone={b.status === 'WAITLIST' ? 'pending' : 'positive'}
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
          <Card padding="none" xstyle={styles.emptyLg}>
            <Icon name="clock" {...stylex.props(styles.mutedIcon)} />
            <p {...stylex.props(styles.emptyText)}>{t('noClasses')}</p>
            <ButtonLink
              href="/member/classes"
              variant="primary"
              size="inline"
              label={t('browseClasses')}
            />
          </Card>
        )}
      </section>
    </div>
  );
}
