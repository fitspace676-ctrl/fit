'use client';

import { type FormEvent, useState, useTransition } from 'react';
import type { StaffRole } from '@fit/types';
import { Btn, Card } from '@/components/ui';
import { inviteStaffAction } from './actions';

/** The roles someone can be invited as, high-to-low privilege, with their labels. */
const ROLE_OPTIONS: ReadonlyArray<{ value: StaffRole; label: string }> = [
  { value: 'MANAGER', label: 'Manager' },
  { value: 'RECEPTIONIST', label: 'Receptionist' },
  { value: 'TRAINER', label: 'Trainer' },
  { value: 'OWNER', label: 'Owner' },
];

/**
 * The "invite staff" form (T4.7). Submits an email + role to the invite Server
 * Action, which emails the invitee a one-time accept link. On success the form
 * clears and shows a confirmation; the page revalidates so the new pending invite
 * appears below. Errors (e.g. `ALREADY_STAFF`) surface inline.
 */
export function InviteForm() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('MANAGER');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await inviteStaffAction({ email, role });
      if (result.ok) {
        setNote(`Invitation sent to ${email}.`);
        setEmail('');
        setRole('MANAGER');
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-ink-700 dark:text-ink-200">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="off"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              className="h-11 rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-700 dark:text-ink-200">Role</span>
            <select
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              disabled={pending}
              className="h-11 rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Btn type="submit" v="primary" disabled={pending}>
            {pending ? 'Sending…' : 'Send invite'}
          </Btn>
        </div>

        {note ? (
          <p
            role="status"
            className="rounded-card bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-200"
          >
            {note}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-card bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-200"
          >
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
