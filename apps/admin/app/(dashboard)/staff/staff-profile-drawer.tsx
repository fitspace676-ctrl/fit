'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { StaffMember, UpdateStaffProfileInput } from '@fit/types';
import { Badge, Dot, Drawer } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { ROLE_TONES, STATUS_DOT, STATUS_TONES, initialsOf } from './role-meta';
import {
  StaffFormFields,
  hasBadHours,
  hoursFromShifts,
  toWorkingHours,
  type StaffFormValue,
} from './staff-form-fields';
import { loadStaffScheduleAction } from './depth-actions';
import { updateStaffProfileAction, updateStaffRoleAction } from './actions';
import { createDateTimeFormat, defaultLocale } from '@fit/i18n';

const FORM_ID = 'staff-profile-form';

const styles = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
  },
  avatar: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '3rem',
    height: '3rem',
    flexShrink: 0,
    borderRadius: '9999px',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
    fontSize: '1rem',
    fontWeight: 700,
  },
  identityText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    minWidth: 0,
  },
  name: {
    margin: 0,
    fontSize: '1.0625rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    alignItems: 'center',
  },
  badgeGap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  coachLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    marginTop: '0.5rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-accent)',
      ':hover': 'var(--color-text-primary)',
    },
  },
  coachIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  detailRow: {
    display: 'grid',
    gridTemplateColumns: '9rem 1fr',
    gap: '0.75rem',
    paddingInline: '0.875rem',
    paddingBlock: '0.6875rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    fontSize: '0.875rem',
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
    alignSelf: 'center',
  },
  detailValue: {
    color: 'var(--color-text-primary)',
    wordBreak: 'break-word',
  },
  muted: {
    color: 'var(--color-text-secondary)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  error: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: '9999px',
    borderWidth: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed',
    },
    transitionProperty: 'filter, background-color, opacity',
    transitionDuration: '150ms',
    opacity: {
      default: 1,
      ':disabled': 0.6,
    },
  },
  btnCancel: {
    backgroundColor: {
      default: 'var(--color-background-muted)',
      ':hover': 'var(--color-border)',
    },
    color: 'var(--color-text-primary)',
  },
  // The brand fill, not the retired purple-pink sweep: the gradient in light
  // mode, the flat lime with dark ink in dark.
  btnPrimary: {
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
    color: 'var(--color-on-accent)',
    filter: {
      default: 'brightness(1)',
      ':hover': 'brightness(1.05)',
      ':active': 'brightness(0.95)',
    },
  },
  btnIcon: {
    width: '1rem',
    height: '1rem',
  },
});

/** Build the edit-form seed from a member (working hours are merged in later). */
function seedForm(member: StaffMember): StaffFormValue {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    role: member.role,
    status: member.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    email: member.email,
    phone: member.phone ?? '',
    locationIds: member.assignedLocationIds,
    hours: hoursFromShifts([]),
  };
}

/**
 * The staff-member profile drawer (T-staff-directory). Opens on a roster row
 * click: a read-only summary (identity, role/status, contact, locations, joined)
 * with an **Edit** button that flips the drawer into the shared
 * {@link StaffFormFields} form, prefilled from the member and their fetched weekly
 * schedule. Saving patches the profile via `PATCH /staff/:id/profile`; a changed
 * role goes through the separate role endpoint first. On success the page
 * revalidates so the roster reflects the edit.
 */
export function StaffProfileDrawer({
  member,
  onClose,
  locations,
}: {
  member: StaffMember | null;
  onClose: () => void;
  locations: { id: string; name: string }[];
}) {
  const t = useTranslations('admin.staff');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [form, setForm] = useState<StaffFormValue | null>(null);
  const [preparing, startPreparing] = useTransition();
  const [pending, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Keyed remount (see the console) resets state per member, so no sync effect is
  // needed here — a fresh open always starts in view mode with no form.
  if (!member) return null;

  function close(): void {
    if (pending || preparing) return;
    onClose();
  }

  function enterEdit(): void {
    if (!member) return;
    setError(null);
    const seed = seedForm(member);
    startPreparing(async () => {
      const result = await loadStaffScheduleAction(member.id);
      const hours = result.ok ? hoursFromShifts(result.data.shifts) : seed.hours;
      setForm({ ...seed, hours });
      setMode('edit');
    });
  }

  function patch(next: Partial<StaffFormValue>): void {
    setForm((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function save(): void {
    if (!form || !member) return;
    setError(null);
    if (form.firstName.trim() === '') {
      setError(t('addStaffDrawer.errors.firstNameRequired'));
      return;
    }
    if (form.role === '') {
      setError(t('addStaffDrawer.errors.roleRequired'));
      return;
    }
    if (hasBadHours(form.hours)) {
      setError(t('addStaffDrawer.errors.badHours'));
      return;
    }

    const roleChanged = form.role !== member.role;
    const input: UpdateStaffProfileInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      status: form.status,
      email: form.email.trim() || undefined,
      phone: form.phone.trim(),
      assignedLocationIds: form.locationIds,
      workingHours: toWorkingHours(form.hours),
    };

    startSaving(async () => {
      if (roleChanged && form.role !== '') {
        const roleResult = await updateStaffRoleAction(member.id, form.role);
        if (!roleResult.ok) {
          setError(roleResult.error);
          return;
        }
      }
      const result = await updateStaffProfileAction(member.id, input);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  const detail = (label: string, value: string, empty: boolean, last = false) => (
    <div {...stylex.props(styles.detailRow, last && styles.detailRowLast)}>
      <span {...stylex.props(styles.detailLabel)}>{label}</span>
      <span {...stylex.props(styles.detailValue, empty && styles.muted)}>{value}</span>
    </div>
  );

  const editing = mode === 'edit' && form !== null;

  return (
    <Drawer
      open={member !== null}
      onClose={close}
      label={editing ? t('profileDrawer.editTitle') : t('profileDrawer.title')}
      dismissible={!pending}
      footer={
        editing ? (
          <>
            <button
              type="button"
              onClick={() => {
                setMode('view');
                setError(null);
              }}
              disabled={pending}
              {...stylex.props(styles.btn, styles.btnCancel)}
            >
              {t('profileDrawer.cancel')}
            </button>
            <button
              type="submit"
              form={FORM_ID}
              disabled={pending}
              {...stylex.props(styles.btn, styles.btnPrimary)}
            >
              <Icon name="check" {...stylex.props(styles.btnIcon)} sw={2.5} />
              {pending ? t('profileDrawer.saving') : t('profileDrawer.save')}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={close} {...stylex.props(styles.btn, styles.btnCancel)}>
              {t('profileDrawer.close')}
            </button>
            <button
              type="button"
              onClick={enterEdit}
              disabled={preparing}
              {...stylex.props(styles.btn, styles.btnPrimary)}
            >
              <Icon name="settings" {...stylex.props(styles.btnIcon)} sw={2} />
              {preparing ? t('profileDrawer.loading') : t('profileDrawer.edit')}
            </button>
          </>
        )
      }
    >
      {editing ? (
        <form
          id={FORM_ID}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          {...stylex.props(styles.form)}
        >
          <StaffFormFields value={form} onChange={patch} locations={locations} pending={pending} />
          {error ? (
            <p role="alert" {...stylex.props(styles.error)}>
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <div {...stylex.props(styles.body)}>
          <div {...stylex.props(styles.identity)}>
            <span {...stylex.props(styles.avatar)}>{initialsOf(member.name)}</span>
            <div {...stylex.props(styles.identityText)}>
              <h3 {...stylex.props(styles.name)}>{member.name}</h3>
              <div {...stylex.props(styles.badges)}>
                <Badge tone={ROLE_TONES[member.role]} label={t(`roles.${member.role}`)} />
                <Badge
                  tone={STATUS_TONES[member.status]}
                  label={
                    <>
                      <Dot tone={STATUS_DOT[member.status]} /> {t(`status.${member.status}`)}
                    </>
                  }
                />
              </div>
              {/* The coach profile this person teaches under — the same human on
                  the Trainers screen, where their bio, specialties, availability
                  and the classes assigned to them live. */}
              {member.trainerId ? (
                <Link href={`/trainers/${member.trainerId}`} {...stylex.props(styles.coachLink)}>
                  <Icon name="dumbbell" {...stylex.props(styles.coachIcon)} sw={2} />
                  {t('profileDrawer.coachProfile')}
                </Link>
              ) : null}
            </div>
          </div>

          <div {...stylex.props(styles.details)}>
            {detail(t('addStaffDrawer.email'), member.email || '-', !member.email)}
            {detail(t('addStaffDrawer.phone'), member.phone || '-', !member.phone)}
            {detail(
              t('addStaffDrawer.locations'),
              member.locations.length > 0 ? member.locations.join(', ') : '-',
              member.locations.length === 0,
            )}
            {detail(
              t('profileDrawer.joined'),
              createDateTimeFormat(defaultLocale, {}).format(new Date(member.joinedAt)),
              false,
              true,
            )}
          </div>

          {error ? (
            <p role="alert" {...stylex.props(styles.error)}>
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
