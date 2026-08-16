/**
 * Login-less "directory" identities.
 *
 * `User.email` is required and unique, but plenty of the people a gym records
 * never sign in: a staff member typed straight into the directory, or a coach
 * added from the Trainers screen (who gets a staff record through the staff ⇄
 * trainer link). Those users are backed by a synthetic address on a host that
 * receives no mail, and the API blanks it back to `''` on the wire so the console
 * never shows it.
 *
 * Shared here rather than owned by the staff service, because both the staff
 * directory and the trainer roster mint these identities and they must agree on
 * the host — the projection that hides the address keys off it.
 */

import { randomUUID } from 'node:crypto';

/** Host for the synthetic address given to a person who has no login. */
export const PLACEHOLDER_EMAIL_HOST = 'no-login.fit.local';

/** A fresh, unique placeholder address for a login-less user. */
export function placeholderEmail(): string {
  return `staff-${randomUUID()}@${PLACEHOLDER_EMAIL_HOST}`;
}

/** Whether `email` is one of the synthetic addresses (i.e. not a real contact). */
export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(`@${PLACEHOLDER_EMAIL_HOST}`);
}

/**
 * Split a display name into the First/Last pair the staff roster renders. A
 * single-word name has no surname (`null`), never a copy of the first name.
 */
export function splitDisplayName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? 'Trainer',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}
