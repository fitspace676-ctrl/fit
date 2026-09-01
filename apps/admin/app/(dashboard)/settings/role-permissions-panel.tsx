'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  EDITABLE_PERMISSIONS,
  PERMISSION_MATRIX_SECTIONS,
  Permission,
  branchScopeSchema,
  defaultRolePermissions,
  type BranchScope,
  type GymRolePermissionsSettings,
  type PermissionMatrixColumn,
  type PermissionMatrixRow,
  type StaffRole,
} from '@fit/types';
import { Card, Checkbox } from '@fit/ui-kit';
import { Icon, useFormContext, useWatch, type IconName } from '@/components/ui';

/**
 * The Roles &amp; permissions section of Settings — the editable half of
 * {@link PERMISSION_MATRIX_SECTIONS}.
 *
 * It is a section of the settings form rather than a screen of its own on purpose:
 * the grants live in `Gym.settings.permissions`, so they save through the same
 * `PATCH /gyms/settings` as the brand and the business hours, and inherit that
 * form's dirty tracking, its Discard, and its one sticky save bar. A second form on
 * the same page would have given the operator two "unsaved changes" bars competing
 * for the same corner of the screen.
 *
 * The shape of the screen is a rail of roles beside a panel for the selected one,
 * nested inside the settings rail — the same relationship the sidebar has to this
 * page, one level down.
 */

// ---------------------------------------------------------------------------
// The form slice
// ---------------------------------------------------------------------------

/**
 * The roles this screen may edit.
 *
 * `satisfies Record<Exclude<StaffRole, 'OWNER'>, true>` is doing real work: adding
 * a fifth staff role fails to compile here rather than quietly rendering a rail
 * that is missing it. OWNER is excluded because it is the locked system role — it
 * is drawn, and it has no entry to write.
 */
const EDITABLE_ROLE_KEYS = {
  MANAGER: true,
  RECEPTIONIST: true,
  TRAINER: true,
} as const satisfies Record<Exclude<StaffRole, 'OWNER'>, true>;

/** A staff role whose grants a gym may change — {@link EDITABLE_ROLE_KEYS}. */
export type EditableRole = keyof typeof EDITABLE_ROLE_KEYS;

/** The editable roles in rail order. */
const EDITABLE_ROLES = Object.keys(EDITABLE_ROLE_KEYS) as EditableRole[];

/** The rail, top to bottom: the locked system role first, then the three editable ones. */
const RAIL_ROLES: StaffRole[] = ['OWNER', ...EDITABLE_ROLES];

/** One role's row as the form holds it — the same pair the contract stores. */
export interface RolePermissionsFormValue {
  grants: Permission[];
  branchScope: BranchScope;
}

/** The `permissions` slice of the settings form: the three editable roles, never OWNER. */
export type PermissionsFormValues = Record<EditableRole, RolePermissionsFormValue>;

const roleValueSchema = z.object({
  // The element type is the whole `Permission` enum rather than the editable
  // subset: the only writer is this screen's own checkboxes, which can offer
  // nothing else, and `updateGymRolePermissionsSchema` re-checks editability on
  // the way to the API. A second refinement here would need a second translated
  // message for an error no operator can produce.
  grants: z.array(z.nativeEnum(Permission)),
  branchScope: branchScopeSchema,
});

/** The settings form's `permissions` schema — one complete row per editable role. */
export const permissionsFormSchema = z.object({
  MANAGER: roleValueSchema,
  RECEPTIONIST: roleValueSchema,
  TRAINER: roleValueSchema,
});

/**
 * The form's starting values, from the settings the server resolved.
 *
 * Arrays are copied rather than shared: react-hook-form keeps `defaultValues` to
 * compare against for the dirty flag, and handing it the same array instance the
 * editor replaces would make Discard compare a value with itself.
 */
export function permissionsFormDefaults(
  permissions: GymRolePermissionsSettings,
): PermissionsFormValues {
  return {
    MANAGER: {
      grants: [...permissions.MANAGER.grants],
      branchScope: permissions.MANAGER.branchScope,
    },
    RECEPTIONIST: {
      grants: [...permissions.RECEPTIONIST.grants],
      branchScope: permissions.RECEPTIONIST.branchScope,
    },
    TRAINER: {
      grants: [...permissions.TRAINER.grants],
      branchScope: permissions.TRAINER.branchScope,
    },
  };
}

/** The host form, narrowed to the slice this file binds to. */
type PermissionsFormHost = { permissions: PermissionsFormValues };

// ---------------------------------------------------------------------------
// Grant arithmetic
// ---------------------------------------------------------------------------

const EDITABLE_SET = new Set<Permission>(EDITABLE_PERMISSIONS);

/**
 * `grants` with `permission` added or removed, re-ordered canonically.
 *
 * The re-order is what keeps the dirty flag honest: react-hook-form compares
 * arrays element by element, so a set that was ticked back to where it started
 * has to come out in the same order it went in, or Discard stays lit over a form
 * that matches the server exactly.
 */
function withGrant(grants: Permission[], permission: Permission, next: boolean): Permission[] {
  const held = new Set(grants);
  if (next) {
    held.add(permission);
  } else {
    held.delete(permission);
  }
  return EDITABLE_PERMISSIONS.filter((value) => held.has(value));
}

/**
 * The grants after one cell of `row` is toggled.
 *
 * **Manage implies view, in both directions.** The route gate keys off the view
 * permission, so a role holding `MemberWrite` without `MemberRead` gets a nav item
 * that is hidden and a page that will not open, over an API that accepts its
 * writes — a combination no operator would choose on purpose and none can read off
 * two checkboxes. Ticking Manage therefore ticks View, and unticking View unticks
 * Manage. Nothing is granted invisibly: both boxes move on screen.
 */
function toggleCell(
  grants: Permission[],
  row: PermissionMatrixRow,
  column: PermissionMatrixColumn,
  next: boolean,
): Permission[] {
  if (row.cells.kind === 'single') {
    return withGrant(grants, row.cells.permission, next);
  }
  const { view, manage } = row.cells;
  if (column === 'view') {
    return next
      ? withGrant(grants, view, true)
      : withGrant(withGrant(grants, manage, false), view, false);
  }
  return next
    ? withGrant(withGrant(grants, view, true), manage, true)
    : withGrant(grants, manage, false);
}

/** Whether `grants` holds the permission behind one cell of `row`. */
function cellChecked(
  grants: readonly Permission[],
  row: PermissionMatrixRow,
  column: PermissionMatrixColumn,
): boolean {
  if (row.cells.kind === 'single') {
    return grants.includes(row.cells.permission);
  }
  return grants.includes(column === 'view' ? row.cells.view : row.cells.manage);
}

/** How many of the {@link EDITABLE_PERMISSIONS} a grant set actually holds. */
function grantedCount(grants: readonly Permission[]): number {
  return grants.filter((permission) => EDITABLE_SET.has(permission)).length;
}

/** OWNER's row, drawn but never written — every capability, every branch. */
const OWNER_ROW: RolePermissionsFormValue = {
  grants: [...ALL_PERMISSIONS],
  branchScope: 'all',
};

/** The branch-scope choices, in the order the cards are drawn. */
const BRANCH_SCOPES: { value: BranchScope; icon: IconName }[] = [
  { value: 'all', icon: 'grid' },
  { value: 'assigned', icon: 'pin' },
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = stylex.create({
  header: {
    marginBottom: '1.25rem',
  },
  headerTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  headerDesc: {
    marginTop: '0.125rem',
    marginBottom: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  panelCard: {
    padding: {
      default: '1.25rem',
      '@media (min-width: 640px)': '1.5rem',
    },
  },
  // Mirrors the settings page's own `230px 1fr`, one level in — but at the wider
  // breakpoint, because this rail sits INSIDE that one and two 230px columns plus
  // a permission matrix do not fit a laptop.
  layout: {
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1280px)': '240px 1fr',
    },
  },
  minCol: {
    minWidth: 0,
  },
  railWrap: {
    height: 'fit-content',
    position: {
      default: 'static',
      '@media (min-width: 1280px)': 'sticky',
    },
    top: {
      default: 'auto',
      '@media (min-width: 1280px)': '88px',
    },
  },
  railCard: {
    padding: '0.375rem',
  },
  railList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  roleBtn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    width: '100%',
    borderStyle: 'none',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.625rem',
    textAlign: 'left',
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  roleBtnActive: {
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
    color: 'var(--color-on-accent)',
    boxShadow: '0 6px 20px -8px var(--color-shadow)',
  },
  roleBtnInactive: {
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
  },
  roleHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  roleName: {
    fontSize: '0.8125rem',
    fontWeight: 600,
  },
  lockGlyph: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
  },
  roleDesc: {
    margin: 0,
    fontSize: '0.75rem',
    lineHeight: 1.4,
    // Inherits the button's colour so the active row reads on the accent fill
    // without a second, hard-coded pair of tones.
    color: 'inherit',
    opacity: 0.8,
  },
  roleCount: {
    fontSize: '0.6875rem',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'inherit',
    opacity: 0.75,
  },
  // -- Panel ----------------------------------------------------------------
  panelStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  panelHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  // Hand-rolled: the kit's Badge is a status pill, and this is a running tally.
  countBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  resetBtn: {
    borderStyle: 'none',
    backgroundColor: 'transparent',
    padding: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    cursor: 'pointer',
    textDecorationLine: { default: 'none', ':hover': 'underline' },
  },
  lockNotice: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
    paddingInline: '1rem',
    paddingBlock: '0.875rem',
  },
  lockNoticeIcon: {
    marginTop: '0.125rem',
    height: '1rem',
    width: '1rem',
    flexShrink: 0,
    color: 'var(--color-icon-secondary)',
  },
  lockNoticeTitle: {
    margin: 0,
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  lockNoticeBody: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  // -- Branch scope ---------------------------------------------------------
  panelTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    minWidth: 0,
  },
  panelTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.9375rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  legend: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  legendHint: {
    margin: 0,
    marginTop: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  scopeGrid: {
    marginTop: '0.75rem',
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, 1fr)',
    },
  },
  scopeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.375rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.875rem',
    textAlign: 'left',
    cursor: 'pointer',
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
  },
  scopeCardActive: {
    borderColor: 'var(--color-accent)',
    boxShadow: 'inset 0 0 0 1px var(--color-accent)',
  },
  scopeCardLocked: {
    cursor: 'not-allowed',
    opacity: 0.55,
  },
  scopeIcon: {
    height: '1.125rem',
    width: '1.125rem',
    color: 'var(--color-icon-secondary)',
  },
  scopeTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  scopeHint: {
    fontSize: '0.75rem',
    lineHeight: 1.45,
    color: 'var(--color-text-secondary)',
  },
  // -- Matrix ---------------------------------------------------------------
  scroll: {
    overflowX: 'auto',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  table: {
    width: '100%',
    minWidth: '30rem',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  th: {
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
  thCol: {
    textAlign: 'center',
    whiteSpace: 'nowrap',
    width: '7rem',
  },
  sectionHead: {
    paddingInline: '1rem',
    paddingBlock: '0.5rem',
    textAlign: 'left',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-muted)',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  rowLabel: {
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    textAlign: 'left',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  cell: {
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    textAlign: 'center',
  },
  cellInner: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  wideLabel: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  matrixHint: {
    margin: 0,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
});

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

/**
 * The whole section: the role rail, and the panel for whichever role is selected.
 *
 * `staffCountByRole` is derived from the live roster (`GET /staff`) by the page —
 * never invented, and absent rather than zero when the roster could not be read.
 */
export function RolePermissionsSection({
  staffCountByRole,
}: {
  /**
   * How many staff hold each role right now, or `null` when the roster could not
   * be read. `null` draws no head-count at all: "0 staff members" under every
   * role is a statement about the gym, and a failed request is not entitled to
   * make one.
   */
  staffCountByRole: Partial<Record<StaffRole, number>> | null;
}) {
  const t = useTranslations('admin.settings.permissions');
  const [role, setRole] = useState<StaffRole>('OWNER');
  return (
    <div>
      {/* The heading sits ABOVE the split rather than in a `SectionCard` wrapping
          it: the rail and the panel are each a card of their own, and nesting two
          cards inside a third only draws borders around borders. */}
      <div {...stylex.props(styles.header)}>
        <h3 {...stylex.props(styles.headerTitle)}>{t('title')}</h3>
        <p {...stylex.props(styles.headerDesc)}>{t('subtitle')}</p>
      </div>
      <div {...stylex.props(styles.layout)}>
        <RoleRail role={role} onSelect={setRole} staffCountByRole={staffCountByRole} />
        <div {...stylex.props(styles.minCol)}>
          <Card padding="none" xstyle={styles.panelCard}>
            <RolePanel role={role} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** The rail: every staff role, with its description, its head-count, and OWNER's padlock. */
function RoleRail({
  role,
  onSelect,
  staffCountByRole,
}: {
  role: StaffRole;
  onSelect: (next: StaffRole) => void;
  staffCountByRole: Partial<Record<StaffRole, number>> | null;
}) {
  const t = useTranslations('admin.settings.permissions');
  const tStaff = useTranslations('admin.staff');
  return (
    <div {...stylex.props(styles.railWrap)}>
      <Card padding="none" xstyle={styles.railCard}>
        {/* Plain buttons with `aria-current`, exactly as the settings section
            rail beside it — not a `tablist`. A tablist promises roving-tabindex
            arrow-key navigation between the roles, and half a keyboard pattern is
            worse for a screen-reader user than none. */}
        <div role="group" aria-label={t('rolesLabel')} {...stylex.props(styles.railList)}>
          {RAIL_ROLES.map((entry) => {
            const active = entry === role;
            return (
              <button
                key={entry}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(entry)}
                {...stylex.props(
                  styles.roleBtn,
                  active ? styles.roleBtnActive : styles.roleBtnInactive,
                )}
              >
                <span {...stylex.props(styles.roleHead)}>
                  <span {...stylex.props(styles.roleName)}>{tStaff(`roles.${entry}`)}</span>
                  {entry === 'OWNER' ? (
                    <Icon
                      name="lock"
                      aria-label={t('lockedAria')}
                      {...stylex.props(styles.lockGlyph)}
                      sw={2}
                    />
                  ) : null}
                </span>
                <p {...stylex.props(styles.roleDesc)}>{tStaff(`roleDesc.${entry}`)}</p>
                {staffCountByRole === null ? null : (
                  <span {...stylex.props(styles.roleCount)}>
                    {tStaff('rolesPermissions.staffCount', {
                      count: staffCountByRole[entry] ?? 0,
                    })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/**
 * The panel for one role: the tally, the branch-scope cards, and the matrix.
 *
 * OWNER renders through exactly the same components with `locked` set, rather than
 * through a read-only variant of them: one code path means the padlocked screen
 * cannot drift from the editable one, and there is no second place where a control
 * could be left live.
 */
function RolePanel({ role }: { role: StaffRole }) {
  const t = useTranslations('admin.settings.permissions');
  const tAdmin = useTranslations('admin');
  const tStaff = useTranslations('admin.staff');
  const { control, setValue } = useFormContext<PermissionsFormHost>();
  const edited = useWatch({ control, name: 'permissions' });

  const locked = role === 'OWNER';
  const value: RolePermissionsFormValue = locked
    ? OWNER_ROW
    : (edited?.[role] ?? { grants: [], branchScope: 'assigned' });

  const total = EDITABLE_PERMISSIONS.length;
  const granted = locked ? total : grantedCount(value.grants);

  function write(next: RolePermissionsFormValue): void {
    if (locked) return;
    setValue(`permissions.${role}`, next, {
      shouldDirty: true,
      shouldTouch: true,
    });
  }

  return (
    <div {...stylex.props(styles.panelStack)}>
      <div {...stylex.props(styles.panelHead)}>
        <div {...stylex.props(styles.panelTitleGroup)}>
          <h4 {...stylex.props(styles.panelTitle)}>{tStaff(`roles.${role}`)}</h4>
          <span
            {...stylex.props(styles.countBadge)}
            aria-label={t('grantedAria', { granted, total })}
          >
            {t('granted', { granted, total })}
          </span>
        </div>
        {locked ? null : (
          <button
            type="button"
            onClick={() => write(defaultRolePermissions(role))}
            aria-label={t('resetAria', { role: tStaff(`roles.${role}`) })}
            {...stylex.props(styles.resetBtn)}
          >
            {t('reset')}
          </button>
        )}
      </div>

      {locked ? (
        <div {...stylex.props(styles.lockNotice)}>
          <Icon name="lock" aria-hidden {...stylex.props(styles.lockNoticeIcon)} sw={2} />
          <div>
            <p {...stylex.props(styles.lockNoticeTitle)}>{t('ownerNoticeTitle')}</p>
            <p {...stylex.props(styles.lockNoticeBody)}>{t('ownerNoticeBody')}</p>
          </div>
        </div>
      ) : null}

      <div>
        <p {...stylex.props(styles.legend)}>{t('branchScope.legend')}</p>
        <p {...stylex.props(styles.legendHint)}>{t('branchScope.hint')}</p>
        <div
          role="radiogroup"
          aria-label={t('branchScope.legend')}
          {...stylex.props(styles.scopeGrid)}
        >
          {BRANCH_SCOPES.map((scope) => {
            const active = value.branchScope === scope.value;
            return (
              <button
                key={scope.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={locked}
                onClick={() => write({ ...value, branchScope: scope.value })}
                {...stylex.props(
                  styles.scopeCard,
                  active && styles.scopeCardActive,
                  locked && styles.scopeCardLocked,
                )}
              >
                <Icon name={scope.icon} aria-hidden {...stylex.props(styles.scopeIcon)} sw={2} />
                <span {...stylex.props(styles.scopeTitle)}>
                  {t(`branchScope.${scope.value}.title`)}
                </span>
                <span {...stylex.props(styles.scopeHint)}>
                  {t(`branchScope.${scope.value}.hint`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div {...stylex.props(styles.scroll)}>
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th scope="col" {...stylex.props(styles.th)}>
                {t('matrix.capability')}
              </th>
              <th scope="col" {...stylex.props(styles.th, styles.thCol)}>
                {t('matrix.view')}
              </th>
              <th scope="col" {...stylex.props(styles.th, styles.thCol)}>
                {t('matrix.manage')}
              </th>
            </tr>
          </thead>
          {PERMISSION_MATRIX_SECTIONS.map((section) => (
            <tbody key={section.section}>
              <tr>
                <th scope="colgroup" colSpan={3} {...stylex.props(styles.sectionHead)}>
                  {tAdmin(section.labelKey)}
                </th>
              </tr>
              {section.rows.map((row) => {
                const label = tAdmin(row.labelKey);
                return (
                  <tr key={row.resource}>
                    <th scope="row" {...stylex.props(styles.rowLabel)}>
                      {label}
                    </th>
                    {row.cells.kind === 'single' ? (
                      // One permission, so ONE control spanning both columns —
                      // never a live checkbox beside a greyed ghost, which would
                      // read as a Manage the gym is not allowed rather than a
                      // Manage that does not exist.
                      <td colSpan={2} {...stylex.props(styles.cell)}>
                        <span {...stylex.props(styles.cellInner)}>
                          <Checkbox
                            label={t('matrix.cellLabel', {
                              resource: label,
                              column: t('matrix.access'),
                            })}
                            labelHidden
                            checked={locked || cellChecked(value.grants, row, 'view')}
                            disabled={locked}
                            onChange={(event) =>
                              write({
                                ...value,
                                grants: toggleCell(value.grants, row, 'view', event.target.checked),
                              })
                            }
                          />
                          <span aria-hidden {...stylex.props(styles.wideLabel)}>
                            {t('matrix.access')}
                          </span>
                        </span>
                      </td>
                    ) : (
                      (['view', 'manage'] as const).map((column) => (
                        <td key={column} {...stylex.props(styles.cell)}>
                          <Checkbox
                            label={t('matrix.cellLabel', {
                              resource: label,
                              column: t(`matrix.${column}`),
                            })}
                            labelHidden
                            checked={locked || cellChecked(value.grants, row, column)}
                            disabled={locked}
                            onChange={(event) =>
                              write({
                                ...value,
                                grants: toggleCell(value.grants, row, column, event.target.checked),
                              })
                            }
                          />
                        </td>
                      ))
                    )}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <p {...stylex.props(styles.matrixHint)}>{t('matrix.pairHint')}</p>
      <p {...stylex.props(styles.matrixHint)}>{t('matrix.singleHint')}</p>
    </div>
  );
}
