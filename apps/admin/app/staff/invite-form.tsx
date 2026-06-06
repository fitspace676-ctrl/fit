'use client';

import { type FormEvent, useState, useTransition } from 'react';
import type { StaffRole } from '@fit/types';
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
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className="rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Role</span>
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            disabled={pending}
            className="rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send invite'}
        </button>
      </div>

      {note ? (
        <p role="status" className="rounded-card bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
