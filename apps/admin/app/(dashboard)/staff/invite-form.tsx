'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { ROLE_PERMISSIONS, type StaffRole } from '@fit/types';
import { Btn, Icon, useToast } from '@/components/ui';
import { Glyph } from './icons';
import { PERMISSION_LABELS, ROLE_DOT, ROLE_OPTIONS, roleLabel } from './role-meta';
import { inviteStaffAction } from './actions';

/**
 * A short, real summary of what a role can do, derived from {@link ROLE_PERMISSIONS}
 * (the same table the API enforces) rather than hand-written copy.
 */
function roleSummary(role: StaffRole): string {
  const perms = ROLE_PERMISSIONS[role];
  const sample = perms.slice(0, 3).map((perm) => PERMISSION_LABELS[perm].toLowerCase());
  const more = perms.length - sample.length;
  return `can ${sample.join(', ')}${more > 0 ? ` — plus ${more} more permission${more === 1 ? '' : 's'}` : ''}.`;
}

/**
 * The "invite staff" flow (T4.7): a primary trigger button opening the reference's
 * invite modal — email field, a two-column role picker with tone dots, and a
 * permission hint derived from the selected role's real capability set. Submits
 * to the invite Server Action, which emails the invitee a one-time accept link.
 * On success the modal closes and a toast confirms; the page revalidates so the
 * new pending invite appears in the Invitations tab. Errors (e.g. `ALREADY_STAFF`)
 * surface inline in the modal.
 */
export function InviteForm() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('RECEPTIONIST');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Escape closes the modal, matching the reference behaviour.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function openModal(): void {
    setEmail('');
    setRole('RECEPTIONIST');
    setError(null);
    setOpen(true);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteStaffAction({ email, role });
      if (result.ok) {
        setOpen(false);
        toast(`Invite sent to ${email}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Btn v="primary" size="sm" icon="plus" onClick={openModal}>
        Invite staff
      </Btn>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Invite staff"
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <form
            onSubmit={onSubmit}
            className="relative w-full rounded-t-card bg-white shadow-[0_40px_100px_-24px_rgba(0,0,0,0.7)] ring-1 ring-ink-200 backdrop-blur-2xl dark:bg-ink-900/95 dark:ring-white/10 sm:max-w-md sm:rounded-card"
          >
            <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4 dark:border-white/10 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_6px_18px_-6px_rgba(124,58,237,0.8)]">
                  <Glyph name="mail" className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white">
                    Invite staff
                  </h2>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    They&rsquo;ll get an email to set up access.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-btn text-ink-500 transition-colors hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-white/[0.06]"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div>
                <label
                  htmlFor="invite-email"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400"
                >
                  Email address
                </label>
                <input
                  id="invite-email"
                  type="email"
                  name="email"
                  required
                  autoComplete="off"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={pending}
                  className="h-11 w-full rounded-field bg-ink-50 px-3.5 text-sm text-ink-900 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500/50 disabled:opacity-50 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
                  Role
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((option) => {
                    const active = role === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        disabled={pending}
                        onClick={() => setRole(option.value)}
                        className={`flex h-10 items-center gap-2 rounded-btn px-3 text-sm font-semibold ring-1 ring-inset transition ${
                          active
                            ? 'bg-brand-500/10 text-brand-700 ring-brand-500/60 dark:text-brand-200'
                            : 'bg-ink-50 text-ink-600 ring-ink-200 hover:bg-ink-100 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`h-2 w-2 rounded-full ${ROLE_DOT[option.value]}`}
                        />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-card bg-iris-50 p-3 ring-1 ring-inset ring-iris-500/20 dark:bg-iris-500/10 dark:ring-iris-400/25">
                <Glyph
                  name="key"
                  className="mt-0.5 h-4 w-4 shrink-0 text-iris-600 dark:text-iris-300"
                />
                <p className="text-xs text-ink-600 dark:text-ink-300">
                  <span className="font-semibold">{roleLabel(role)}</span> {roleSummary(role)}
                </p>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-card bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-200"
                >
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-ink-200 px-5 py-4 dark:border-white/10 sm:px-6">
              <Btn v="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Btn>
              <Btn type="submit" v="primary" disabled={pending}>
                <Glyph name="mail" className="h-4 w-4" />
                {pending ? 'Sending…' : 'Send invite'}
              </Btn>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
