'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { WorkingNowRow } from '@fit/types';
import { Badge, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { ROLE_TONES, initialsOf } from './role-meta';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    padding: '1.5rem',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: 700,
    letterSpacing: '-0.015em',
    color: 'var(--color-text-primary)',
  },
  titleIcon: {
    display: 'grid',
    height: '2rem',
    width: '2rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-success-muted)',
    color: 'var(--color-text-accent)',
  },
  titleIconSvg: {
    height: '1.125rem',
    width: '1.125rem',
  },
  countPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-success-border, var(--color-border))',
    backgroundColor: 'var(--color-success-muted)',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-accent)',
    whiteSpace: 'nowrap',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, 1fr)',
      '@media (min-width: 1024px)': 'repeat(3, 1fr)',
    },
    gap: '0.75rem',
  },
  person: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
  },
  avatar: {
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-muted)',
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: 'var(--color-text-accent)',
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    minWidth: 0,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  hours: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  branch: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    padding: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  emptyIcon: {
    height: '1.125rem',
    width: '1.125rem',
    color: 'var(--color-icon-secondary)',
  },
});

/**
 * The "Who's Working Now" card — the staff currently on shift, derived from the
 * gym's weekly schedule in its own time zone (`GET /staff/working-now`) and
 * rendered above the staff console. Each person shows their avatar initials,
 * name, role badge and shift hours; the header pill counts how many are on
 * shift. It is accurate as of page load and does not refresh on its own.
 *
 * `shifts` arrives already narrowed to the console's branch — the console filters
 * on `ShiftSlot.locationId`, the door the shift staffs, never on the person's
 * roster. See `staff-console.tsx` for why those are different questions.
 */
export function WhosWorkingCard({
  shifts,
  showBranch,
}: {
  shifts: WorkingNowRow[];
  /**
   * Name each person's branch. True only in "All locations" mode, where the card
   * mixes two sites' desks into one grid and the name is the only thing on the
   * tile that says which — the receptionist reading it is standing at one of them.
   * With a branch selected the chrome already names it and every tile would repeat
   * that one constant.
   */
  showBranch: boolean;
}) {
  const t = useTranslations('admin.staff');

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>
          <span {...stylex.props(styles.titleIcon)}>
            <Icon name="briefcase" {...stylex.props(styles.titleIconSvg)} />
          </span>
          {t('workingNow.title')}
        </h2>
        <span {...stylex.props(styles.countPill)}>
          {t('workingNow.onShift', { count: shifts.length })}
        </span>
      </div>

      {shifts.length === 0 ? (
        <div {...stylex.props(styles.empty)}>
          <Icon name="clock" {...stylex.props(styles.emptyIcon)} />
          {t('workingNow.empty')}
        </div>
      ) : (
        <div {...stylex.props(styles.grid)}>
          {shifts.map((shift) => (
            <div key={shift.staffId} {...stylex.props(styles.person)}>
              <span {...stylex.props(styles.avatar)}>{initialsOf(shift.name)}</span>
              <div {...stylex.props(styles.info)}>
                <span {...stylex.props(styles.name)}>{shift.name}</span>
                <div {...stylex.props(styles.meta)}>
                  <Badge tone={ROLE_TONES[shift.role]} label={t(`roles.${shift.role}`)} />
                  <span {...stylex.props(styles.hours)}>
                    {shift.startTime} – {shift.endTime}
                  </span>
                </div>
                {/*
                  A shift with no branch gets a dash, never an empty line — the
                  roster's own blank cells make the same point: "-" reads as "we
                  have no answer", a gap reads as a tile that failed to render.
                  Only reachable here, in all-branches mode, since a filtered card
                  matches by equality and drops it.

                  `shift.unresolvedLocation` is deliberately NOT used as a
                  fallback. A surviving free-text label means precisely "this text
                  named no branch of this gym" — a typo, a room, a closed site —
                  and printing it beside a name would present it as the branch this
                  person is standing at, which is the one thing it is known not to
                  be. It is an operator's queue item, and it belongs wherever that
                  queue eventually gets a screen.
                */}
                {showBranch ? (
                  <span {...stylex.props(styles.branch)}>{shift.locationName ?? '-'}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
