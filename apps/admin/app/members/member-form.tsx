'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MemberStatus } from '@fit/types';
import { createMemberAction, updateMemberAction } from './actions';

/** Selectable initial statuses when creating a member (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: MemberStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INVITED', label: 'Invited' },
];

/** Shared field styling so create + edit render identically. */
const FIELD_CLASS =
  'w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:bg-slate-50 disabled:text-slate-500';

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
      <div className="flex flex-col gap-1">
        <label htmlFor="member-name" className="text-sm font-medium text-slate-700">
          Name
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
        <label htmlFor="member-email" className="text-sm font-medium text-slate-700">
          Email
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
          <p className="text-xs text-slate-400">
            Email is the member’s sign-in identity and can’t be changed here.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="member-phone" className="text-sm font-medium text-slate-700">
          Phone <span className="font-normal text-slate-400">(optional)</span>
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
          <label htmlFor="member-status" className="text-sm font-medium text-slate-700">
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
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create member'}
        </button>
        <Link href={cancelHref} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  );
}
