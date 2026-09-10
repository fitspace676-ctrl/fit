// Sign out — the row, the confirmation, and the call that actually revokes.
//
// ===========================================================================
// TWO THINGS THIS COMPONENT EXISTS TO GET RIGHT.
//
//   1. IT CONFIRMS FIRST. Sign-out is one tap from the bottom of a scrolling
//      list of otherwise-harmless rows, and undoing it means finding the
//      password again. `ConfirmSheet` is `accessibilityViewIsModal`, holds the
//      destructive fill on the confirm button, and swallows a second press
//      while `busy` — so a double tap cannot fire two sign-outs.
//
//   2. IT CALLS `signOut()`, NOT `clearTokens()`. The deleted app never called
//      `POST /auth/logout`, so every sign-out left a 30-day refresh token AND
//      ITS WHOLE ROTATION FAMILY live on the server: the user believed they
//      were signed out, and the session was still spendable. `signOut()`
//      unregisters the push device, revokes the family, then clears — both
//      network legs best-effort under a 5s cap, but ATTEMPTED. It never
//      rejects, so there is no failure branch to render; a member on a plane
//      still ends up locally signed out.
//
// Split out of `settings.tsx` so the confirm-first behaviour can be asserted
// without mounting the whole screen and its four queries.
// ===========================================================================

import { useCallback, useState } from 'react';
import { ConfirmSheet, ListRow } from '@fit/ui-mobile';

import { useI18n } from '../../providers/I18nProvider';

export interface SignOutSectionProps {
  /**
   * Performs the sign-out. Injected rather than imported so a test can assert
   * the confirm-first ordering without a keychain, and so the screen keeps the
   * single import of `lib/auth/session`.
   */
  onSignOut: () => Promise<unknown>;
  /** Called once the sign-out has settled — the screen navigates from here. */
  onSignedOut?: () => void;
  testID?: string;
}

export function SignOutSection({
  onSignOut,
  onSignedOut,
  testID = 'settings-sign-out',
}: SignOutSectionProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback(() => {
    if (busy) return;
    setBusy(true);
    void onSignOut()
      .catch(() => {
        // `signOut()` is documented never to reject; this arm exists so an
        // injected double cannot wedge the sheet open with `busy` latched.
        return undefined;
      })
      .then(() => {
        setBusy(false);
        setOpen(false);
        onSignedOut?.();
      });
  }, [busy, onSignOut, onSignedOut]);

  return (
    <>
      <ListRow
        icon="logout"
        title={t('settings.about.signOut')}
        // The one destructive row on the screen. `ListRow`'s `danger` is a red
        // plate, glyph and title — a warning precisely because nothing else
        // here is red.
        danger
        onPress={() => {
          setOpen(true);
        }}
        testID={testID}
      />

      <ConfirmSheet
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={confirm}
        title={t('settings.about.signOut')}
        note={t('settings.about.signOutConfirm')}
        confirmLabel={t('settings.about.signOut')}
        cancelLabel={t('settings.about.signOutCancel')}
        // TODO(i18n): no namespace-neutral "Close" exists; `classes.modal.close`
        // is the closest real, translated string. `common.close` is one of the
        // six shared-chrome keys the plan says are owed.
        closeAccessibilityLabel={t('classes.modal.close')}
        destructive
        busy={busy}
        testID={`${testID}-confirm`}
      />
    </>
  );
}
