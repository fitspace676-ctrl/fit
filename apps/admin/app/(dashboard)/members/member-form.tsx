'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { MemberStatus } from '@fit/types';
import { Btn, Icon } from '@/components/ui';
import { createMemberAction, updateMemberAction } from './actions';

/** Selectable initial statuses when creating a member; labels come from `form.status<Value>`. */
const CREATE_STATUSES: ReadonlyArray<{ value: MemberStatus; labelKey: string }> = [
  { value: 'ACTIVE', labelKey: 'statusActive' },
  { value: 'INVITED', labelKey: 'statusInvited' },
];

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    maxWidth: '32rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  labelOptional: {
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  field: {
    height: '2.75rem',
    width: '100%',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':disabled': 'var(--color-background-muted)',
    },
    paddingBlock: 0,
    fontSize: '0.875rem',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-disabled)',
    },
    outline: 'none',
  },
  hint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  cancelLink: {
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-secondary)',
  },
});

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
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="member-name" {...stylex.props(styles.label)}>
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
          {...stylex.props(styles.field)}
        />
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="member-email" {...stylex.props(styles.label)}>
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
          {...stylex.props(styles.field)}
        />
        {isEdit ? <p {...stylex.props(styles.hint)}>{t('form.emailReadonlyHint')}</p> : null}
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="member-phone" {...stylex.props(styles.label)}>
          {t('form.phone')}{' '}
          <span {...stylex.props(styles.labelOptional)}>{t('form.phoneOptional')}</span>
        </label>
        <input
          id="member-phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="off"
          {...stylex.props(styles.field)}
        />
      </div>

      {!isEdit ? (
        <div {...stylex.props(styles.fieldGroup)}>
          <label htmlFor="member-status" {...stylex.props(styles.label)}>
            {t('form.status')}
          </label>
          <select
            id="member-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as MemberStatus)}
            {...stylex.props(styles.field)}
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
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {error}
          </p>
        </Card>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Btn type="submit" v="primary" disabled={pending}>
          {pending ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.createMember')}
        </Btn>
        <Link href={cancelHref} {...stylex.props(styles.cancelLink)}>
          {t('form.cancel')}
        </Link>
      </div>
    </form>
  );
}
