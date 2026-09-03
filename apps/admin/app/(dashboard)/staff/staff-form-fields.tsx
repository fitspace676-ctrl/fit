'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { ShiftSlotRow, StaffRole } from '@fit/types';
import { SelectField, Switch } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { STAFF_ROLES } from './role-meta';

/** Weekday indices the schedule uses — 0 (Mon) … 6 (Sun), reusing the schedule i18n. */
export const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Directory statuses a record may take (never `INVITED`). */
export const STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type DirectoryStatus = (typeof STATUSES)[number];

/** HH:mm options in 30-minute steps, matching the API's `timeOfDay` format. */
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  return `${h}:${i % 2 === 0 ? '00' : '30'}`;
});

export type DayHours = { on: boolean; start: string; end: string };

/** Mon–Fri on 09:00–17:00, weekend off — the sensible default shift week. */
export function defaultHours(): DayHours[] {
  return DAYS.map((d) => ({ on: d < 5, start: '09:00', end: '17:00' }));
}

/** The controlled value the {@link StaffFormFields} grid edits. */
export interface StaffFormValue {
  firstName: string;
  lastName: string;
  role: StaffRole | '';
  status: DirectoryStatus;
  email: string;
  phone: string;
  locationIds: string[];
  hours: DayHours[];
}

/** A blank form — the Add drawer's starting point. */
export function emptyStaffForm(): StaffFormValue {
  return {
    firstName: '',
    lastName: '',
    role: '',
    status: 'ACTIVE',
    email: '',
    phone: '',
    locationIds: [],
    hours: defaultHours(),
  };
}

/** One stored window of a day - `start`/`end` in the API's `HH:mm` format. */
export type DayBlock = { start: string; end: string };

/**
 * Group a member's stored shift rows by weekday, each day's blocks in start
 * order. Unlike {@link hoursFromShifts} - which folds a day to the single block
 * the editor can hold - this keeps every row, so a coach's split shift (two
 * windows on one day, mirrored from `Trainer.availability`) reads in full.
 */
export function blocksFromShifts(shifts: ShiftSlotRow[]): DayBlock[][] {
  return DAYS.map((d) =>
    shifts
      .filter((s) => s.dayOfWeek === d)
      .map((s) => ({ start: s.startTime, end: s.endTime }))
      .sort((a, b) => a.start.localeCompare(b.start)),
  );
}

/** Fold a member's stored shift rows into the seven-day toggle grid. */
export function hoursFromShifts(shifts: ShiftSlotRow[]): DayHours[] {
  return DAYS.map((d) => {
    const shift = shifts.find((s) => s.dayOfWeek === d);
    return shift
      ? { on: true, start: shift.startTime, end: shift.endTime }
      : { on: false, start: '09:00', end: '17:00' };
  });
}

/** Project the toggle grid to the API's `workingHours` shape (on-days only). */
export function toWorkingHours(
  hours: DayHours[],
): { dayOfWeek: number; startTime: string; endTime: string }[] {
  return hours
    .map((h, index) => ({ ...h, dayOfWeek: index }))
    .filter((h) => h.on)
    .map((h) => ({ dayOfWeek: h.dayOfWeek, startTime: h.start, endTime: h.end }));
}

/** True when an on-day has an end at or before its start — the one client check. */
export function hasBadHours(hours: DayHours[]): boolean {
  return hours.some((h) => h.on && h.end <= h.start);
}

const styles = stylex.create({
  fields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    minWidth: 0,
  },
  labelText: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  input: {
    height: '2.75rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  chipIcon: {
    width: '0.75rem',
    height: '0.75rem',
  },
  toggleChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.4375rem',
    borderRadius: '9999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer',
    transitionProperty: 'color, background-color, border-color',
    transitionDuration: '150ms',
  },
  toggleOn: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  toggleOff: {
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  empty: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  hours: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '0.75rem',
  },
  hourRow: {
    display: 'grid',
    gridTemplateColumns: '2.75rem auto 1fr 1fr',
    alignItems: 'center',
    gap: '0.625rem',
  },
  dayName: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  dayOff: {
    gridColumn: '3 / span 2',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The shared directory-staff field grid — first/last name, role, status, contact
 * details, assigned locations and a weekly working-hours editor. Fully controlled
 * (`value` + `onChange` patch), so both the Add drawer and the profile Edit form
 * compose it and own their own submit/validation. Labels live under the
 * `admin.staff.addStaffDrawer` namespace, reused across both surfaces.
 */
export function StaffFormFields({
  value,
  onChange,
  locations,
  pending,
  roleOptions = STAFF_ROLES,
  roleLocked = false,
  hoursLocked = false,
  lockedHours,
}: {
  value: StaffFormValue;
  onChange: (patch: Partial<StaffFormValue>) => void;
  /** The gym's live locations, offered as assignable-location chips. */
  locations: { id: string; name: string }[];
  pending: boolean;
  /** The roles this session may pick (a non-owner is never offered Owner). */
  roleOptions?: readonly StaffRole[];
  /** True when the role may not be changed by this session (an Owner edited by a non-owner). */
  roleLocked?: boolean;
  /**
   * True when this member's hours are owned elsewhere and must not be edited
   * here - a coach, whose week lives on `Trainer.availability` and is mirrored
   * onto their shift rows. The grid renders the stored week without controls, so
   * the front desk can still read it.
   */
  hoursLocked?: boolean;
  /**
   * The stored week a locked grid displays, by weekday - the rows themselves
   * rather than `value.hours`, which holds at most one block a day. Absent (or
   * a day with no blocks) reads as a day off. Ignored unless `hoursLocked`.
   */
  lockedHours?: DayBlock[][];
}) {
  const t = useTranslations('admin.staff');

  function toggleLocation(id: string): void {
    const next = value.locationIds.includes(id)
      ? value.locationIds.filter((x) => x !== id)
      : [...value.locationIds, id];
    onChange({ locationIds: next });
  }

  function setDay(index: number, patch: Partial<DayHours>): void {
    onChange({ hours: value.hours.map((h, i) => (i === index ? { ...h, ...patch } : h)) });
  }

  return (
    <div {...stylex.props(styles.fields)}>
      <div {...stylex.props(styles.row)}>
        <label {...stylex.props(styles.field)}>
          <span {...stylex.props(styles.labelText)}>{t('addStaffDrawer.firstName')}</span>
          <input
            name="firstName"
            autoComplete="off"
            placeholder={t('addStaffDrawer.firstNamePlaceholder')}
            value={value.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            disabled={pending}
            {...stylex.props(styles.input)}
          />
        </label>
        <label {...stylex.props(styles.field)}>
          <span {...stylex.props(styles.labelText)}>{t('addStaffDrawer.lastName')}</span>
          <input
            name="lastName"
            autoComplete="off"
            placeholder={t('addStaffDrawer.lastNamePlaceholder')}
            value={value.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            disabled={pending}
            {...stylex.props(styles.input)}
          />
        </label>
      </div>

      {/* The kit's `SelectField` draws its own micro-label and binds it to the
          control, so the loose `<span>` that used to sit above each select is
          gone — it looked like a label and named nothing. */}
      <div {...stylex.props(styles.row)}>
        <SelectField
          label={t('addStaffDrawer.role')}
          value={value.role}
          onChange={(event) => onChange({ role: event.target.value as StaffRole | '' })}
          disabled={pending || roleLocked}
          xstyle={styles.field}
          options={[
            { value: '', label: t('addStaffDrawer.rolePlaceholder') },
            // The current value stays listed even when it is not on offer, so an
            // Owner's own row still reads "Owner" rather than a blank.
            ...STAFF_ROLES.filter((r) => roleOptions.includes(r) || r === value.role).map((r) => ({
              value: r,
              label: t(`roles.${r}`),
            })),
          ]}
        />
        <SelectField
          label={t('addStaffDrawer.status')}
          value={value.status}
          onChange={(event) => onChange({ status: event.target.value as DirectoryStatus })}
          disabled={pending}
          xstyle={styles.field}
          options={STATUSES.map((s) => ({
            value: s,
            label: t(`addStaffDrawer.statuses.${s}`),
          }))}
        />
      </div>

      <div {...stylex.props(styles.row)}>
        <label {...stylex.props(styles.field)}>
          <span {...stylex.props(styles.labelText)}>{t('addStaffDrawer.email')}</span>
          <input
            type="email"
            name="email"
            autoComplete="off"
            placeholder={t('addStaffDrawer.emailPlaceholder')}
            value={value.email}
            onChange={(e) => onChange({ email: e.target.value })}
            disabled={pending}
            {...stylex.props(styles.input)}
          />
        </label>
        <label {...stylex.props(styles.field)}>
          <span {...stylex.props(styles.labelText)}>{t('addStaffDrawer.phone')}</span>
          <input
            type="tel"
            name="phone"
            autoComplete="off"
            placeholder={t('addStaffDrawer.phonePlaceholder')}
            value={value.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            disabled={pending}
            {...stylex.props(styles.input)}
          />
        </label>
      </div>

      <div {...stylex.props(styles.section)}>
        <span {...stylex.props(styles.labelText)}>{t('addStaffDrawer.locations')}</span>
        {locations.length > 0 ? (
          <div {...stylex.props(styles.chips)}>
            {locations.map((loc) => {
              const selected = value.locationIds.includes(loc.id);
              return (
                <button
                  key={loc.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleLocation(loc.id)}
                  disabled={pending}
                  {...stylex.props(
                    styles.toggleChip,
                    selected ? styles.toggleOn : styles.toggleOff,
                  )}
                >
                  {selected ? (
                    <Icon name="check" {...stylex.props(styles.chipIcon)} sw={2.5} />
                  ) : null}
                  {loc.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p {...stylex.props(styles.empty)}>{t('addStaffDrawer.noLocations')}</p>
        )}
      </div>

      <div {...stylex.props(styles.section)}>
        <span {...stylex.props(styles.labelText)}>{t('addStaffDrawer.workingHours')}</span>
        {hoursLocked ? (
          <p {...stylex.props(styles.empty)}>{t('addStaffDrawer.hoursFromTrainer')}</p>
        ) : null}
        <div {...stylex.props(styles.hours)}>
          {DAYS.map((d) => {
            const h = value.hours[d]!;
            // A locked row reads from the stored rows, so a split shift shows
            // both of its windows instead of only the first.
            const blocks = hoursLocked ? (lockedHours?.[d] ?? []) : [];
            return (
              <div key={d} {...stylex.props(styles.hourRow)}>
                <span {...stylex.props(styles.dayName)}>
                  {t(`depth.schedule.days.${d}` as 'depth.schedule.days.0')}
                </span>
                {hoursLocked ? (
                  <span />
                ) : (
                  <Switch
                    checked={h.on}
                    onChange={(next) => setDay(d, { on: next })}
                    label={t(`depth.schedule.days.${d}` as 'depth.schedule.days.0')}
                    // The day-name span already names the row.
                    hideLabel
                  />
                )}
                {hoursLocked ? (
                  blocks.length > 0 ? (
                    <span {...stylex.props(styles.dayOff)}>
                      {blocks.map((b) => `${b.start} - ${b.end}`).join(', ')}
                    </span>
                  ) : (
                    <span {...stylex.props(styles.dayOff)}>{t('addStaffDrawer.dayOff')}</span>
                  )
                ) : h.on ? (
                  <>
                    <SelectField
                      label={t('addStaffDrawer.startTime')}
                      labelHidden
                      size="chrome"
                      value={h.start}
                      onChange={(event) => setDay(d, { start: event.target.value })}
                      disabled={pending}
                      options={TIME_OPTIONS.map((time) => ({ value: time, label: time }))}
                    />
                    <SelectField
                      label={t('addStaffDrawer.endTime')}
                      labelHidden
                      size="chrome"
                      value={h.end}
                      onChange={(event) => setDay(d, { end: event.target.value })}
                      disabled={pending}
                      options={TIME_OPTIONS.map((time) => ({ value: time, label: time }))}
                    />
                  </>
                ) : (
                  <span {...stylex.props(styles.dayOff)}>{t('addStaffDrawer.dayOff')}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
