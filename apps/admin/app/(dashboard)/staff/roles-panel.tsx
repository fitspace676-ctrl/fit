'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Permission, type ListStaffRolesResponse } from '@fit/types';
import { Icon } from '@/components/ui';

/** All fine-grained permissions, in a stable display order (the matrix rows). */
const PERMISSION_ORDER: Permission[] = Object.values(Permission);

/**
 * Convert a {@link Permission} value (`resource:action`, e.g. `credit-pack:manage`)
 * to its camelCase `admin.staff.permissions.*` i18n key (`creditPackManage`), so the
 * matrix labels reuse the existing translated permission names.
 */
function permissionKey(value: string): string {
  const words = value.split(/[:-]/);
  return words
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
}

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  intro: {
    margin: 0,
    maxWidth: '46rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  scroll: {
    overflowX: 'auto',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  table: {
    width: '100%',
    minWidth: '38rem',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  th: {
    position: 'sticky',
    top: 0,
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    textAlign: 'left',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-muted)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  thRole: {
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  td: {
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    color: 'var(--color-text-primary)',
  },
  tdCell: {
    textAlign: 'center',
  },
  granted: {
    display: 'inline-grid',
    height: '1.25rem',
    width: '1.25rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  denied: {
    color: 'var(--color-text-disabled)',
  },
  icon: {
    height: '0.875rem',
    width: '0.875rem',
  },
  count: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontWeight: 400,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  cap: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
    fontWeight: 400,
    textTransform: 'none',
    letterSpacing: 'normal',
  },
});

/**
 * The read-only Roles &amp; Permissions matrix (T12.15) — one column per staff role
 * and one row per fine-grained capability, ticked where the role grants it. Data
 * comes from `GET /staff/roles` (the single-source authorization map), so the view
 * can never drift from what the API actually enforces.
 */
export function RolesPanel({ roles }: { roles: ListStaffRolesResponse }) {
  const t = useTranslations('admin.staff');
  const rows = roles.roles;

  return (
    <div {...stylex.props(styles.stack)}>
      <p {...stylex.props(styles.intro)}>{t('depth.roles.intro')}</p>
      <div {...stylex.props(styles.scroll)}>
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th scope="col" {...stylex.props(styles.th)}>
                {t('depth.roles.capability')}
              </th>
              {rows.map((role) => (
                <th key={role.role} scope="col" {...stylex.props(styles.th, styles.thRole)}>
                  {t(`roles.${role.role}`)}{' '}
                  <span {...stylex.props(styles.count)}>({role.permissions.length})</span>
                  <p {...stylex.props(styles.cap)}>{t(`roleCaps.${role.role}`)}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_ORDER.map((permission) => (
              <tr key={permission}>
                <th
                  scope="row"
                  {...stylex.props(styles.td)}
                  style={{ textAlign: 'left', fontWeight: 500 }}
                >
                  {t(`permissions.${permissionKey(permission)}` as 'permissions.gymManage')}
                </th>
                {rows.map((role) => {
                  const granted = role.permissions.includes(permission);
                  return (
                    <td key={role.role} {...stylex.props(styles.td, styles.tdCell)}>
                      {granted ? (
                        <span
                          {...stylex.props(styles.granted)}
                          aria-label={t('depth.roles.grantedAria')}
                        >
                          <Icon name="check" {...stylex.props(styles.icon)} />
                        </span>
                      ) : (
                        <span
                          {...stylex.props(styles.denied)}
                          aria-label={t('depth.roles.deniedAria')}
                        >
                          <Icon name="minus" {...stylex.props(styles.icon)} />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
