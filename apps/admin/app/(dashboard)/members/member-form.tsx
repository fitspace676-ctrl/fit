'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { MemberStatus } from '@fit/types';
import { Btn, Card, Icon } from '@/components/ui';
import { createMemberAction, updateMemberAction } from './actions';

/** Selectable initial statuses when creating a member; labels come from `form.status<Value>`. */
const CREATE_STATUSES: ReadonlyArray<{ value: MemberStatus; labelKey: string }> = [
  { value: 'ACTIVE', labelKey: 'statusActive' },
  { value: 'INVITED', labelKey: 'statusInvited' },
];

/** Shared field styling so create + edit render identically. */
const FIELD_CLASS =
  'h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:disabled:bg-white/[0.02] dark:disabled:text-ink-400';

/** Shared label styling. */
const LABEL_CLASS = 'text-sm font-medium text-ink-700 dark:text-ink-200';

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      memberId: string;
      initial: { name: string; email: string; phone: string };
    };

/**
 * The create / edit member form (T4.3). One component serves both flows: in
 * `create` mode it collects name + email (+ optional phone, initial status) and
 * calls {@link createMemberAction}; in `edit` mode the email is shown read-only
 * (it is the immutable auth identity) and it calls {@link updateMemberAction}.
 * On success it navigates to the member's detail page; the discriminated
 * {@link ActionResult} surfaces any API error inline without throwing across the
 * Server Action boundary.
 */
export function MemberForm(props: Props) {
  const t = useTranslations('admin.members');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const [name, setName] = useState(isEdit ? props.initial.name : '');
  const [email, setEmail] = useState(isEdit ? props.initial.email : '');
  const [phone, setPhone] = useState(isEdit ? props.initial.phone : '');
  const [status, setStatus] = useState<MemberStatus>('ACTIVE');

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateMemberAction(props.memberId, { name, phone })
        : await createMemberAction({ name, email, phone, status });
      if (result.ok) {
        router.push(`/members/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/members/${props.memberId}` : '/members';

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="member-name" className={LABEL_CLASS}>
          {t('form.name')}
        </label>
        <input
          id="member-name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="member-email" className={LABEL_CLASS}>
          {t('form.email')}
        </label>
        <input
          id="member-email"
          name="email"
          type="email"
          required={!isEdit}
          disabled={isEdit}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="off"
          className={FIELD_CLASS}
        />
        {isEdit ? <p className="text-xs text-ink-400">{t('form.emailReadonlyHint')}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="member-phone" className={LABEL_CLASS}>
          {t('form.phone')}{' '}
          <span className="font-normal text-ink-400">{t('form.phoneOptional')}</span>
        </label>
        <input
          id="member-phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>

      {!isEdit ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="member-status" className={LABEL_CLASS}>
            {t('form.status')}
          </label>
          <select
            id="member-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as MemberStatus)}
            className={FIELD_CLASS}
          >
            {CREATE_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`form.${option.labelKey}`)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <Card className="flex items-start gap-2 bg-danger-50 px-3 py-2 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-4 w-4 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {error}
          </p>
        </Card>
      ) : null}

      <div className="flex items-center gap-3">
        <Btn type="submit" v="primary" disabled={pending}>
          {pending ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.createMember')}
        </Btn>
        <Link
          href={cancelHref}
          className="text-sm font-medium text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200"
        >
          {t('form.cancel')}
        </Link>
      </div>
    </form>
  );
}
