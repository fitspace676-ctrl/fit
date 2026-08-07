'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { ListStaffRolesResponse, StaffRole } from '@fit/types';
import { Badge, Drawer, Icon } from '@/components/ui';
import { PERMISSION_KEYS, ROLE_TONES } from './role-meta';

const styles = stylex.create({
  intro: {
    margin: 0,
    marginBottom: '1rem',
    maxWidth: '46rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, 1fr)',
      '@media (min-width: 1024px)': 'repeat(4, 1fr)',
    },
    gap: '1rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    height: '100%',
    padding: '1.25rem',
    textAlign: 'left',
    borderWidth: 0,
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transitionProperty: 'transform, box-shadow',
    transitionDuration: '0.15s',
    transform: {
      default: 'none',
      ':hover': 'translateY(-2px)',
    },
    boxShadow: {
      default: 'none',
      ':hover': 'var(--shadow-popover, 0 10px 30px rgba(9, 9, 11, 0.12))',
    },
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  shield: {
    height: '1.25rem',
    width: '1.25rem',
    color: 'var(--color-icon-secondary)',
  },
  desc: {
    margin: 0,
    flex: 1,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  cardFoot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    marginTop: '0.25rem',
  },
  count: {
    fontSize: '0.8125rem',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  chevron: {
    height: '1rem',
    width: '1rem',
    color: 'var(--color-icon-secondary)',
  },
  // -- Drawer ---------------------------------------------------------------
  drawerHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  drawerDesc: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  permHeading: {
    margin: 0,
    marginBottom: '0.5rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  permList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  permItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  permCheck: {
    display: 'grid',
    height: '1.25rem',
    width: '1.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  permCheckIcon: {
    height: '0.75rem',
    width: '0.75rem',
  },
});

/**
 * The Roles &amp; Permissions tab — one card per staff role (badge, description
 * and a live "N staff members" count), rebuilt to the reference staff artboard.
 * The role list and each role's permissions come from `GET /staff/roles` (the
 * single-source authorization matrix), so nothing here can drift from what the
 * API enforces; the staff counts are derived from the current roster. Selecting a
 * card opens a read-only drawer spelling out every capability that role grants.
 */
export function RolesCards({
  roles,
  staffCountByRole,
}: {
  roles: ListStaffRolesResponse;
  staffCountByRole: Partial<Record<StaffRole, number>>;
}) {
  const t = useTranslations('admin.staff');
  const [selected, setSelected] = useState<StaffRole | null>(null);

  const active = roles.roles.find((entry) => entry.role === selected) ?? null;

  return (
    <div>
      <p {...stylex.props(styles.intro)}>{t('rolesPermissions.intro')}</p>

      <div {...stylex.props(styles.grid)}>
        {roles.roles.map((entry) => (
          <Card key={entry.role} variant="default" padding={0}>
            <button
              type="button"
              onClick={() => setSelected(entry.role)}
              aria-label={t('rolesPermissions.openRole', { role: t(`roles.${entry.role}`) })}
              {...stylex.props(styles.card)}
            >
              <div {...stylex.props(styles.cardHead)}>
                <Badge tone={ROLE_TONES[entry.role]}>{t(`roles.${entry.role}`)}</Badge>
                <Icon name="shield" {...stylex.props(styles.shield)} />
              </div>
              <p {...stylex.props(styles.desc)}>{t(`roleDesc.${entry.role}`)}</p>
              <div {...stylex.props(styles.cardFoot)}>
                <span {...stylex.props(styles.count)}>
                  {t('rolesPermissions.staffCount', {
                    count: staffCountByRole[entry.role] ?? 0,
                  })}
                </span>
                <Icon name="chevronRight" {...stylex.props(styles.chevron)} />
              </div>
            </button>
          </Card>
        ))}
      </div>

      <Drawer
        open={active !== null}
        onClose={() => setSelected(null)}
        title={active ? t('rolesPermissions.drawerTitle', { role: t(`roles.${active.role}`) }) : ''}
      >
        {active ? (
          <>
            <div {...stylex.props(styles.drawerHead)}>
              <Badge tone={ROLE_TONES[active.role]}>{t(`roles.${active.role}`)}</Badge>
              <p {...stylex.props(styles.drawerDesc)}>{t(`roleDesc.${active.role}`)}</p>
            </div>
            <p {...stylex.props(styles.permHeading)}>
              {t('rolesPermissions.grants', { count: active.permissions.length })}
            </p>
            <ul {...stylex.props(styles.permList)}>
              {active.permissions.map((perm) => (
                <li key={perm} {...stylex.props(styles.permItem)}>
                  <span {...stylex.props(styles.permCheck)}>
                    <Icon name="check" {...stylex.props(styles.permCheckIcon)} />
                  </span>
                  {t(`permissions.${PERMISSION_KEYS[perm]}`)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
