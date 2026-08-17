'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { CreateStaffInput } from '@fit/types';
import { Drawer } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import {
  StaffFormFields,
  emptyStaffForm,
  hasBadHours,
  toWorkingHours,
  type StaffFormValue,
} from './staff-form-fields';
import { createStaffAction } from './actions';

const FORM_ID = 'staff-add-form';

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  intro: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
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
  // Footer buttons — styled to the Fit brand so the primary matches the shift
  // toggles' purple→pink gradient (the Astryx `Btn` primary renders blue).
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
  btnPrimary: {
    backgroundImage: 'linear-gradient(135deg, #7C3AED, #EC4899)',
    color: '#ffffff',
    boxShadow: '0 6px 24px -6px rgba(98, 87, 227, 0.7)',
    filter: {
      default: 'brightness(1)',
      ':hover': 'brightness(1.1)',
      ':active': 'brightness(0.95)',
    },
  },
  btnIcon: {
    width: '1rem',
    height: '1rem',
  },
});

/**
 * The "Add Staff" drawer (T-staff-directory) — creates a **login-less** directory
 * record via `POST /staff` (no invitation email, no password), distinct from the
 * {@link InviteModal} which emails an accept link. Slides in from the right on the
 * shared animated {@link Drawer}. Only a first name and role are required; contact
 * details, assigned locations and a weekly shift schedule are optional. On success
 * the page revalidates so the new member joins the roster.
 */
export function AddStaffDrawer({
  open,
  onClose,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  /** The gym's live locations, offered as assignable-location chips. */
  locations: { id: string; name: string }[];
}) {
  const t = useTranslations('admin.staff');
  const [form, setForm] = useState<StaffFormValue>(emptyStaffForm);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function patch(next: Partial<StaffFormValue>): void {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function reset(): void {
    setForm(emptyStaffForm());
    setError(null);
  }

  function close(): void {
    if (pending) return;
    reset();
    onClose();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
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

    const input: CreateStaffInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      role: form.role,
      status: form.status,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      assignedLocationIds: form.locationIds,
      workingHours: toWorkingHours(form.hours),
    };

    startTransition(async () => {
      const result = await createStaffAction(input);
      if (result.ok) {
        reset();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      label={t('addStaffDrawer.title')}
      dismissible={!pending}
      footer={
        <>
          <button
            type="button"
            onClick={close}
            disabled={pending}
            {...stylex.props(styles.btn, styles.btnCancel)}
          >
            {t('addStaffDrawer.cancel')}
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={pending}
            {...stylex.props(styles.btn, styles.btnPrimary)}
          >
            <Icon name="plus" {...stylex.props(styles.btnIcon)} sw={2.5} />
            {pending ? t('addStaffDrawer.saving') : t('addStaffDrawer.submit')}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} {...stylex.props(styles.form)}>
        <p {...stylex.props(styles.intro)}>{t('addStaffDrawer.subtitle')}</p>

        <StaffFormFields value={form} onChange={patch} locations={locations} pending={pending} />

        {error ? (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}
