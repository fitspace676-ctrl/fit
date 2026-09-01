'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { StaffRole } from '@fit/types';
import { Button, Dialog } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { INVITE_ROLES } from './role-meta';
import { inviteStaffAction } from './actions';

const FORM_ID = 'staff-invite-form';

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    fontSize: '0.875rem',
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
  fieldset: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  legend: {
    marginBottom: '0.375rem',
    padding: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  roleGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem',
  },
  roleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transitionProperty: 'color, background-color, border-color',
    transitionDuration: '150ms',
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
  },
  roleBtnActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  roleBtnIdle: {
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  callout: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.875rem',
    paddingBlock: '0.75rem',
  },
  calloutIcon: {
    marginTop: '0.125rem',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-icon-accent)',
  },
  calloutText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  calloutStrong: {
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  note: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-accent)',
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
});

/**
 * The "invite staff" modal (T2.10), on the shared formacore overlay kit. Submits
 * an email + role to the invite Server Action, which emails the invitee a
 * one-time accept link; on success the page revalidates so the new pending invite
 * appears under the Invitations tab. The role picker is a segmented grid (matching
 * the staff artboard) rather than a <select>, and a live permission callout
 * summarises what the chosen role can do. Errors (e.g. `ALREADY_STAFF`) surface
 * inline. The form is cleared on success so several people can be invited in a row.
 */
export function InviteModal({
  open,
  onClose,
  canAssignOwner,
}: {
  open: boolean;
  onClose: () => void;
  /** Owners only: the Owner role is offered in the picker. */
  canAssignOwner: boolean;
}) {
  const t = useTranslations('admin.staff');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('MANAGER');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function close(): void {
    if (pending) return;
    setError(null);
    setNote(null);
    onClose();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await inviteStaffAction({ email, role });
      if (result.ok) {
        setNote(t('inviteModal.success', { email }));
        setEmail('');
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!pending}
      title={t('inviteModal.title')}
      description={t('inviteModal.subtitle')}
      actions={
        <>
          <Button
            variant="secondary"
            size="card"
            onClick={close}
            disabled={pending}
            label={t('inviteModal.cancel')}
          />
          <Button
            variant="primary"
            size="card"
            type="submit"
            form={FORM_ID}
            disabled={pending}
            icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
            label={pending ? t('inviteModal.sending') : t('inviteModal.send')}
          />
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} {...stylex.props(styles.form)}>
        <label {...stylex.props(styles.fieldLabel)}>
          <span {...stylex.props(styles.labelText)}>{t('inviteModal.emailLabel')}</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder={t('inviteModal.emailPlaceholder')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            {...stylex.props(styles.input)}
          />
        </label>

        <fieldset {...stylex.props(styles.fieldset)}>
          <legend {...stylex.props(styles.legend)}>{t('inviteModal.roleLabel')}</legend>
          <div {...stylex.props(styles.roleGrid)}>
            {INVITE_ROLES.filter((option) => option !== 'OWNER' || canAssignOwner).map((option) => {
              const active = option === role;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  disabled={pending}
                  onClick={() => setRole(option)}
                  {...stylex.props(
                    styles.roleBtn,
                    active ? styles.roleBtnActive : styles.roleBtnIdle,
                  )}
                >
                  {t(`roles.${option}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div {...stylex.props(styles.callout)}>
          <Icon name="shield" {...stylex.props(styles.calloutIcon)} sw={2} />
          <p {...stylex.props(styles.calloutText)}>
            <span {...stylex.props(styles.calloutStrong)}>{t(`roles.${role}`)}</span> ·{' '}
            {t(`roleCaps.${role}`)}
          </p>
        </div>

        {note ? (
          <p role="status" {...stylex.props(styles.note)}>
            {note}
          </p>
        ) : null}
        {error ? (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
