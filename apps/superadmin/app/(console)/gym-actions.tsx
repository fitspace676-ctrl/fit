'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { GymStatus } from '@fit/types';
import { Button, ConfirmDialog } from '@fit/ui-kit';
import { setGymStatusAction, startImpersonationAction } from './actions';

/** The little a gym needs to be acted on, so both screens can pass their own shape. */
export interface ActionableGym {
  id: string;
  name: string;
  subdomainSlug: string;
  status: GymStatus;
  /**
   * `null` for a gym bound to no owner — nobody to impersonate. Only its presence
   * is read here, so the narrowest shape both callers satisfy is enough: the
   * roster's summary owner and the detail screen's fuller one both fit.
   */
  owner: { email: string } | null;
}

const styles = stylex.create({
  row: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.375rem',
  },
});

/**
 * The two privileged actions on one gym — enter its console, and switch it off —
 * shared by the roster row and the detail screen.
 *
 * Shared because the confirmation is the part worth keeping in one place: a
 * suspension locks out every member of staff and every member of the gym, and a
 * second copy of that dialog is a second chance to word the consequence more
 * softly than it deserves.
 *
 * Errors are handed UP rather than rendered here: in a table cell there is no
 * room for a message, and both parents already own a banner.
 */
export function GymActions({
  gym,
  onError,
  size = 'inline',
}: {
  gym: ActionableGym;
  onError: (message: string | null) => void;
  /** `inline` in a table row, `card` on the detail screen's header. */
  size?: 'inline' | 'card';
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function applyStatus(next: GymStatus) {
    onError(null);
    startTransition(async () => {
      const result = await setGymStatusAction(gym.id, next);
      if (!result.ok) {
        onError(result.error);
      }
      setConfirming(false);
    });
  }

  /**
   * Open the gym's console as its owner, in a new tab.
   *
   * The tab is opened SYNCHRONOUSLY, inside the click, and only navigated once
   * the handoff URL comes back. Popup blockers allow `window.open` only from a
   * direct user gesture, and the gesture is over by the time the Server Action
   * resolves — opening first and pointing it afterwards is what keeps the click
   * from being swallowed. If the tab was blocked anyway, the current tab goes
   * instead, which is worse but not nothing.
   *
   * A new tab rather than this one because the operator is still working here:
   * entering one gym should not close the roster they are working through.
   */
  function enterAdmin() {
    onError(null);
    const tab = window.open('', '_blank', 'noopener');
    startTransition(async () => {
      const result = await startImpersonationAction(gym.id, gym.subdomainSlug);
      if (result.ok) {
        if (tab) {
          tab.location.replace(result.data.url);
        } else {
          window.location.assign(result.data.url);
        }
      } else {
        tab?.close();
        onError(result.error);
      }
    });
  }

  return (
    <div {...stylex.props(styles.row)}>
      <Button
        variant="secondary"
        size={size}
        label="Enter admin"
        // A gym with no owner has nobody to act as — the API answers
        // `422 GYM_HAS_NO_OWNER`, so the console says so instead of asking.
        disabled={gym.owner === null}
        title={gym.owner === null ? 'This gym has no owner to impersonate' : undefined}
        loading={pending}
        onClick={enterAdmin}
      />
      {gym.status === 'ACTIVE' ? (
        <Button
          variant="ghost"
          size={size}
          label="Suspend"
          loading={pending}
          onClick={() => setConfirming(true)}
        />
      ) : (
        <Button
          variant="secondary"
          size={size}
          label="Reactivate"
          loading={pending}
          onClick={() => applyStatus('ACTIVE')}
        />
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Suspend ${gym.name}?`}
        description="Its staff and members will not be able to start a new session until it is reactivated. Sessions already open expire on their own."
        cancelLabel="Cancel"
        confirmLabel="Suspend"
        confirmVariant="destructive"
        loading={pending}
        onConfirm={() => applyStatus('SUSPENDED')}
      />
    </div>
  );
}
