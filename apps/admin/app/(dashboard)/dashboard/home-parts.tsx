import Link from 'next/link';
import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { createDateTimeFormat, createNumberFormat } from '@fit/i18n';
import type { getTranslations } from 'next-intl/server';
import { zonedClock, zonedIsoDate, zonedMinutesOfDay } from '../classes/schedule/week';
import type { TrainerAgendaItem } from './trainer-home-model';

// Building blocks shared by the role homes (trainer, reception): one visual
// language — the owner overview's hairline metric strip and schedule rows.

const UPCOMING_LIMIT = 5;

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    textWrap: 'balance',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  // Same hairline strip as the owner overview: the 1px gap shows the border
  // colour through, each cell paints over it.
  strip: {
    display: 'grid',
    gap: '1px',
    overflow: 'hidden',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-border)',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    paddingBlock: '0.875rem',
    paddingInline: '1rem',
    backgroundColor: 'var(--color-background-surface)',
  },
  cellLabel: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  cellValue: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  cellFoot: {
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  workArea: {
    display: 'grid',
    gap: '1.5rem',
    alignItems: 'start',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'minmax(0, 2.2fr) minmax(280px, 1fr)',
    },
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    minWidth: 0,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  cardTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  cardLink: {
    flexShrink: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    textDecoration: { default: 'none', ':hover': 'underline' },
    textUnderlineOffset: '0.2em',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '0.625rem',
    paddingInline: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  rowCurrent: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  rowDone: {
    opacity: 0.55,
  },
  accent: {
    flexShrink: 0,
    width: '0.25rem',
    height: '2rem',
    borderRadius: 'var(--radius-full)',
  },
  time: {
    flexShrink: 0,
    width: '3.25rem',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  timeStart: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  main: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  rowTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  rowLink: {
    textDecoration: { default: 'none', ':hover': 'underline' },
    textUnderlineOffset: '0.2em',
  },
  rowSub: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  kind: {
    flexShrink: 0,
    paddingInline: '0.375rem',
    paddingBlock: '0.0625rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    fontSize: '0.6875rem',
    fontWeight: 600,
  },
  place: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  right: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.25rem',
  },
  seats: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  phase: {
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    borderRadius: 'var(--radius-full)',
    fontSize: '0.6875rem',
    fontWeight: 650,
    whiteSpace: 'nowrap',
  },
  phaseNow: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  phaseNext: {
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  phaseDone: {
    color: 'var(--color-text-secondary)',
  },
  compactRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '0.625rem',
    borderBlockStartWidth: '1px',
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: 'var(--color-border)',
  },
  compactList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  day: {
    flexShrink: 0,
    width: '3rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingBlock: '0.25rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-background-muted)',
    lineHeight: 1.15,
  },
  dayWeekday: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  dayNumber: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  avatar: {
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    width: '2.25rem',
    height: '2.25rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  muted: {
    flexShrink: 0,
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  empty: {
    margin: 0,
    paddingBlock: '1.5rem',
    paddingInline: '1rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

export type T = Awaited<ReturnType<typeof getTranslations>>;

export interface Formatters {
  time: (iso: string) => string;
  weekday: (iso: string) => string;
  dayNumber: (iso: string) => string;
  date: (iso: string) => string;
  number: (n: number) => string;
}

/**
 * Formatters on the gym's clock. The console's date formatter reads every instant
 * in UTC, so each instant is first moved onto the gym's wall-clock date.
 */
export function makeFormatters(locale: string, timeZone: string): Formatters {
  const wallDay = (iso: string | Date) =>
    new Date(`${zonedIsoDate(new Date(iso), timeZone)}T00:00:00.000Z`);
  return {
    time: (iso) => zonedClock(new Date(iso), timeZone),
    weekday: (iso) => createDateTimeFormat(locale, { weekday: 'short' }).format(wallDay(iso)),
    dayNumber: (iso) => createDateTimeFormat(locale, { day: 'numeric' }).format(wallDay(iso)),
    date: (iso) =>
      createDateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(wallDay(iso)),
    number: (n) => createNumberFormat(locale, { maximumFractionDigits: 1 }).format(n),
  };
}

/** "Good afternoon, Davit" on the gym's clock, plus today's long date. */
export function greetingLine(
  t: T,
  locale: string,
  timeZone: string,
  name: string | null | undefined,
  now: Date,
): { title: string; longDate: string } {
  const hour = zonedMinutesOfDay(now, timeZone) / 60;
  const greeting = t(
    hour < 12 ? 'greeting.morning' : hour < 18 ? 'greeting.afternoon' : 'greeting.evening',
  );
  const firstName = name?.trim().split(/\s+/)[0] ?? '';
  const longDate = createDateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${zonedIsoDate(now, timeZone)}T00:00:00.000Z`));
  return { title: firstName ? `${greeting}, ${firstName}` : greeting, longDate };
}

/** The page title and subtitle both homes open with. */
export function HomeHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header {...stylex.props(styles.header)}>
      <h1 {...stylex.props(styles.title)}>{title}</h1>
      <p {...stylex.props(styles.subtitle)}>{subtitle}</p>
    </header>
  );
}

/** One metric cell: a label, the figure, and a one-line footnote. */
export interface MetricCell {
  label: string;
  value: string;
  foot: string;
}

/** The hairline metric strip both homes open with — four cells on desktop, two on a phone. */
export function MetricStrip({ cells }: { cells: MetricCell[] }) {
  return (
    <div {...stylex.props(styles.strip)}>
      {cells.map((cell) => (
        <div key={cell.label} {...stylex.props(styles.cell)}>
          <span {...stylex.props(styles.cellLabel)}>{cell.label}</span>
          <span {...stylex.props(styles.cellValue)}>{cell.value}</span>
          <span {...stylex.props(styles.cellFoot)}>{cell.foot}</span>
        </div>
      ))}
    </div>
  );
}

export function Agenda({
  t,
  fmt,
  items,
  failed,
  title,
  emptyText,
  showWho = false,
}: {
  t: T;
  fmt: Formatters;
  items: TrainerAgendaItem[];
  failed: boolean;
  title: string;
  emptyText: string;
  /** Name the coach (class / PT) or the booked member (slot) on each row. */
  showWho?: boolean;
}) {
  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h2 {...stylex.props(styles.cardTitle)}>{title}</h2>
        <Link href="/classes/schedule" {...stylex.props(styles.cardLink)}>
          {t('trainer.agenda.seeAll')}
        </Link>
      </div>
      {failed && items.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t('trainer.loadError')}</p>
      ) : items.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{emptyText}</p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              {...stylex.props(
                styles.row,
                item.phase === 'now' && styles.rowCurrent,
                item.phase === 'done' && styles.rowDone,
              )}
            >
              <span
                aria-hidden
                {...stylex.props(styles.accent)}
                style={{ backgroundColor: item.color ?? 'var(--color-accent)' }}
              />
              <span {...stylex.props(styles.time)}>
                <span {...stylex.props(styles.timeStart)}>{fmt.time(item.startsAt)}</span>
                <span>{fmt.time(item.endsAt)}</span>
              </span>
              <span {...stylex.props(styles.main)}>
                <span {...stylex.props(styles.rowTitle)}>{itemTitle(t, item)}</span>
                <span {...stylex.props(styles.rowSub)}>
                  <span {...stylex.props(styles.kind)}>{t(`trainer.kind.${item.kind}`)}</span>
                  {showWho ? (
                    <span {...stylex.props(styles.place)}>
                      {item.open ? t('trainer.slotOpen') : (item.who ?? item.place ?? '')}
                    </span>
                  ) : item.place ? (
                    <span {...stylex.props(styles.place)}>{item.place}</span>
                  ) : null}
                </span>
              </span>
              <span {...stylex.props(styles.right)}>
                {item.seats ? (
                  <span {...stylex.props(styles.seats)}>
                    {item.seats.booked}/{item.seats.capacity}
                  </span>
                ) : null}
                {item.phase !== 'later' ? (
                  <span
                    {...stylex.props(
                      styles.phase,
                      item.phase === 'now' && styles.phaseNow,
                      item.phase === 'next' && styles.phaseNext,
                      item.phase === 'done' && styles.phaseDone,
                    )}
                  >
                    {t(`trainer.phase.${item.phase}`)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Upcoming({
  t,
  fmt,
  items,
  failed,
}: {
  t: T;
  fmt: Formatters;
  items: TrainerAgendaItem[];
  failed: boolean;
}) {
  const shown = items.slice(0, UPCOMING_LIMIT);
  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h2 {...stylex.props(styles.cardTitle)}>{t('trainer.upcoming.title')}</h2>
        {items.length > shown.length ? (
          <span {...stylex.props(styles.muted)}>
            {t('trainer.upcoming.more', { count: items.length - shown.length })}
          </span>
        ) : null}
      </div>
      {failed && items.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t('trainer.loadError')}</p>
      ) : shown.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t('trainer.upcoming.empty')}</p>
      ) : (
        <ul {...stylex.props(styles.compactList)}>
          {shown.map((item) => (
            <li key={`${item.kind}-${item.id}`} {...stylex.props(styles.compactRow)}>
              <span {...stylex.props(styles.day)}>
                <span {...stylex.props(styles.dayWeekday)}>{fmt.weekday(item.startsAt)}</span>
                <span {...stylex.props(styles.dayNumber)}>{fmt.dayNumber(item.startsAt)}</span>
              </span>
              <span {...stylex.props(styles.main)}>
                <span {...stylex.props(styles.rowTitle)}>{itemTitle(t, item)}</span>
                <span {...stylex.props(styles.rowSub)}>
                  <span>{fmt.time(item.startsAt)}</span>
                  <span aria-hidden>·</span>
                  <span>{t(`trainer.kind.${item.kind}`)}</span>
                </span>
              </span>
              {item.seats ? (
                <span {...stylex.props(styles.muted)}>
                  {item.seats.booked}/{item.seats.capacity}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function itemTitle(t: T, item: TrainerAgendaItem): string {
  return item.title || t('trainer.kind.ptUntitled');
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

// ── Layout pieces for the role homes' own sections ──────────────────────────
// StyleX styles are compiled per file, so the homes compose these components
// rather than importing the style objects.

/** The page column: header, metrics, then the work area. */
export function HomePage({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.page)}>{children}</div>;
}

/** The two-column work area — a wide main column and a rail, stacked on a phone. */
export function WorkArea({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div {...stylex.props(styles.workArea)}>
      <div {...stylex.props(styles.column)}>{main}</div>
      <div {...stylex.props(styles.column)}>{rail}</div>
    </div>
  );
}

/** A titled card, with an optional link or note on the title's right. */
export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h2 {...stylex.props(styles.cardTitle)}>{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** The accent link in a card's header ("Full schedule", "All"). */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} {...stylex.props(styles.cardLink)}>
      {children}
    </Link>
  );
}

/** A dashed empty / error note inside a card. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p {...stylex.props(styles.empty)}>{children}</p>;
}

/** A hairline-separated list of {@link PersonRow}s. */
export function PersonList({ children }: { children: ReactNode }) {
  return <ul {...stylex.props(styles.compactList)}>{children}</ul>;
}

/** One person: initials, name (optionally linked), a secondary line and a right-hand note. */
export function PersonRow({
  name,
  href,
  sub,
  aside,
}: {
  name: string;
  href?: string;
  sub: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <li {...stylex.props(styles.compactRow)}>
      <span aria-hidden {...stylex.props(styles.avatar)}>
        {initialsOf(name)}
      </span>
      <span {...stylex.props(styles.main)}>
        {href ? (
          <Link href={href} {...stylex.props(styles.rowTitle, styles.rowLink)}>
            {name}
          </Link>
        ) : (
          <span {...stylex.props(styles.rowTitle)}>{name}</span>
        )}
        <span {...stylex.props(styles.rowSub)}>{sub}</span>
      </span>
      {aside ? <span {...stylex.props(styles.muted)}>{aside}</span> : null}
    </li>
  );
}
