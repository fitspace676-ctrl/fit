'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MemberStatus } from '@fit/types';
import { Btn, buttonClasses, Card, Icon } from '@/components/ui';
import { createMemberAction, updateMemberAction } from './actions';

/** Selectable initial statuses when creating a member (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: MemberStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INVITED', label: 'Invited' },
];

/** Shared field styling (the reference's inset field surface) so create + edit render identically. */
const FIELD_CLASS =
  'h-11 w-full rounded-field bg-ink-50 px-3.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 outline-none transition placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500 disabled:text-ink-500 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500 dark:disabled:text-ink-400';

/** Shared label styling (the reference's tiny caps labels). */
const LABEL_CLASS =
  'text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400';

/** The required-field marker. */
function Req() {
  return <span className="normal-case text-danger-400"> *</span>;
}

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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="member-name" className={LABEL_CLASS}>
          Name
          <Req />
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="member-email" className={LABEL_CLASS}>
          Email
          {!isEdit ? <Req /> : null}
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
        {isEdit ? (
          <p className="text-xs text-ink-400">
            Email is the member’s sign-in identity and can’t be changed here.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="member-phone" className={LABEL_CLASS}>
          Phone <span className="font-normal normal-case text-ink-400">(optional)</span>
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="member-status" className={LABEL_CLASS}>
            Status
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
                {option.label}
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
        <Link href={cancelHref} className={buttonClasses('ghost', 'md')}>
          Cancel
        </Link>
        <Btn type="submit" v="primary" icon="check" disabled={pending}>
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create member'}
        </Btn>
      </div>
    </form>
  );
}
