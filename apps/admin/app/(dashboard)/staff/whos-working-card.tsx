'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { WorkingNowRow } from '@fit/types';
import { Badge, Icon } from '@/components/ui';
import { ROLE_AVATAR, ROLE_TONES, initialsOf } from './role-meta';

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
    color: 'var(--color-success)',
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
    color: 'var(--color-success)',
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
    color: 'var(--color-success)',
  },
  /** Repaints the initials bubble in that person's role colour (see ROLE_AVATAR). */
  avatarTint: (bg: string, fg: string) => ({ backgroundColor: bg, color: fg }),
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
 */
export function WhosWorkingCard({ shifts }: { shifts: WorkingNowRow[] }) {
  const t = useTranslations('admin.staff');

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
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
              <span {...stylex.props(styles.avatar, styles.avatarTint(...ROLE_AVATAR[shift.role]))}>
                {initialsOf(shift.name)}
              </span>
              <div {...stylex.props(styles.info)}>
                <span {...stylex.props(styles.name)}>{shift.name}</span>
                <div {...stylex.props(styles.meta)}>
                  <Badge tone={ROLE_TONES[shift.role]}>{t(`roles.${shift.role}`)}</Badge>
                  <span {...stylex.props(styles.hours)}>
                    {shift.startTime} – {shift.endTime}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
