'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Badge } from '@astryxdesign/core/Badge';
import type { DashboardOverviewResponse } from '@fit/types';
import { EmptyState, formatDate, initials, memberStatusVariant, timeAgo } from './format';

// The live pill's pulsing dot is shared with `InGymNow` (`overview/in-gym-now.tsx`),
// which owns its own copy of this keyframe — StyleX keyframes are file-local.
const pulse = stylex.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.35 },
  '100%': { opacity: 1 },
});

const styles = stylex.create({
  livePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-accent)',
  },
  liveDot: {
    display: 'inline-block',
    height: '0.375rem',
    width: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'currentColor',
    animationName: pulse,
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
  },
  checkInGrid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '0.5rem',
    // Capped at 2 columns: this list now lives in the overview rail, whose
    // track is `minmax(280px, 1fr)` from 1024px up (see `overview-view.tsx`).
    // A 3-column step here dates from when this was a full-width card at the
    // foot of the page — do not restore it, it packs each row into ~90-110px
    // in the rail and crushes the avatar and both text lines.
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  checkInRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-brand)',
    },
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    // The row publishes its own hover as a custom property, and the two text
    // lines below consume it to stop clipping. StyleX has no descendant
    // selectors, so this is how a parent's state reaches a child — and hovering
    // ANYWHERE on the row has to work, because the clipped name is a few pixels
    // wide and is a hopeless target on its own.
    //
    // `:focus-within` comes along for the keyboard: these rows will carry a link
    // to the member's profile, and a name that only opens for a mouse would be
    // half an affordance.
    '--recent-line-clip': {
      default: 'nowrap',
      ':hover': 'normal',
      ':focus-within': 'normal',
    },
  },
  avatar: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  alertMain: {
    minWidth: 0,
    flex: 1,
  },
  // Both text lines clip rather than wrap, because a wrapping row would make the
  // grid's rows different heights. In the rail's 2-column step that clip is
  // severe — a long name can come down to a letter and an ellipsis — so every
  // row carries the full string in a `title`, and hovering gives it back.
  alertTitle: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'var(--recent-line-clip, nowrap)',
    overflowWrap: 'anywhere',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  alertDetail: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'var(--recent-line-clip, nowrap)',
    overflowWrap: 'anywhere',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/* -------------------------------------------------------------------------- */
/*  Recent check-ins                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The "live" pill that used to sit in the check-ins card's head. Exported so
 * `RecentActivityCard` can put it in the tab row beside that feed's tab, instead
 * of the head this feed no longer has.
 */
export function LiveNowPill() {
  const t = useTranslations('admin.dashboard');
  return (
    <span {...stylex.props(styles.livePill)}>
      <span {...stylex.props(styles.liveDot)} />
      {t('inGymNow.live')}
    </span>
  );
}

export function RecentCheckInsBody({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const rows = data.recentCheckIns;
  return rows.length === 0 ? (
    <EmptyState>{t('recentCheckIns.empty')}</EmptyState>
  ) : (
    <ul {...stylex.props(styles.checkInGrid)}>
      {rows.map((row, i) => {
        const detail = `${row.planName ?? t('recentCheckIns.noPlan')} · ${timeAgo(t, row.checkedInAt)}`;
        return (
          <li key={`${row.checkedInAt}-${i}`} {...stylex.props(styles.checkInRow)}>
            <span {...stylex.props(styles.avatar)} aria-hidden="true">
              {initials(row.name)}
            </span>
            <span {...stylex.props(styles.alertMain)}>
              {/*
              `title` because both lines ellipsise: see `alertTitle`'s comment. It
              is the same affordance `BarChart` and `Heatmap` give their own
              clipped labels, and it costs no JavaScript and no layout.
            */}
              <span {...stylex.props(styles.alertTitle)} title={row.name}>
                {row.name}
              </span>
              <span {...stylex.props(styles.alertDetail)} title={detail}>
                {detail}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The "recent members" body (gym-admin parity) — the latest joiners with their plan,
 * status badge, and membership expiry. Mirrors the recent-check-ins row layout. The
 * payload carries each member's `id` for a future row link into the member's profile
 * route; wiring that link is deferred to a later part of the migration.
 */
export function RecentMembersBody({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();
  const rows = data.recentMembers;
  return rows.length === 0 ? (
    <EmptyState>{t('recentMembers.empty')}</EmptyState>
  ) : (
    <ul {...stylex.props(styles.checkInGrid)}>
      {rows.map((row) => {
        const detail = `${row.planName ?? t('recentMembers.noPlan')}${
          row.expiresAt
            ? ` · ${t('recentMembers.expires', { date: formatDate(locale, row.expiresAt) })}`
            : ''
        }`;
        return (
          <li key={row.id} {...stylex.props(styles.checkInRow)}>
            <span {...stylex.props(styles.avatar)} aria-hidden="true">
              {initials(row.name)}
            </span>
            <span {...stylex.props(styles.alertMain)}>
              {/* Both lines ellipsise in the rail — see the check-ins feed above. */}
              <span {...stylex.props(styles.alertTitle)} title={row.name}>
                {row.name}
              </span>
              <span {...stylex.props(styles.alertDetail)} title={detail}>
                {detail}
              </span>
            </span>
            <Badge
              variant={memberStatusVariant(row.status)}
              label={t(`recentMembers.status.${row.status.toLowerCase()}`)}
            />
          </li>
        );
      })}
    </ul>
  );
}
