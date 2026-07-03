'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { StaffRole } from '@fit/types';
import { Btn, Dot, Icon, Modal } from '@/components/ui';
import { INVITE_ROLES, ROLE_DOT } from './role-meta';
import { inviteStaffAction } from './actions';

const FORM_ID = 'staff-invite-form';

/**
 * The "invite staff" modal (T2.10), on the shared formacore overlay kit. Submits
 * an email + role to the invite Server Action, which emails the invitee a
 * one-time accept link; on success the page revalidates so the new pending invite
 * appears under the Invitations tab. The role picker is a segmented grid (matching
 * the staff artboard) rather than a <select>, and a live permission callout
 * summarises what the chosen role can do. Errors (e.g. `ALREADY_STAFF`) surface
 * inline. The form is cleared on success so several people can be invited in a row.
 */
export function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    <Modal
      open={open}
      onClose={close}
      size="md"
      disableBackdropClose={pending}
      hideClose={pending}
      title={t('inviteModal.title')}
      description={t('inviteModal.subtitle')}
      footer={
        <>
          <Btn v="outline" onClick={close} disabled={pending}>
            {t('inviteModal.cancel')}
          </Btn>
          <Btn v="primary" type="submit" form={FORM_ID} icon="plus" disabled={pending}>
            {pending ? t('inviteModal.sending') : t('inviteModal.send')}
          </Btn>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
            {t('inviteModal.emailLabel')}
          </span>
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder={t('inviteModal.emailPlaceholder')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            className="h-11 rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          />
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
            {t('inviteModal.roleLabel')}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {INVITE_ROLES.map((option) => {
              const active = option === role;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  disabled={pending}
                  onClick={() => setRole(option)}
                  className={`inline-flex items-center gap-2 rounded-field border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500/40 dark:border-brand-400/50 dark:bg-brand-500/10 dark:text-brand-200'
                      : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:text-ink-300 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <Dot c={ROLE_DOT[option]} />
                  {t(`roles.${option}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-start gap-2.5 rounded-field bg-iris-50 px-3.5 py-3 ring-1 ring-inset ring-iris-500/20 dark:bg-iris-500/10 dark:ring-iris-400/20">
          <Icon
            name="shield"
            className="mt-0.5 h-4 w-4 shrink-0 text-iris-600 dark:text-iris-300"
            sw={2}
          />
          <p className="text-sm text-ink-600 dark:text-ink-300">
            <span className="font-semibold text-ink-800 dark:text-ink-100">
              {t(`roles.${role}`)}
            </span>{' '}
            · {t(`roleCaps.${role}`)}
          </p>
        </div>

        {note ? (
          <p
            role="status"
            className="rounded-field bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-200"
          >
            {note}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-field bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-200"
          >
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
