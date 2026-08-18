'use client';

import { useCallback, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';

const styles = stylex.create({
  button: {
    width: '100%',
  },
});

/**
 * Sign out: clear the operator cookies, then leave.
 *
 * `DELETE /api/session` clears only the `ops*` cookies, so an operator who also
 * holds a tenant session in another tab keeps it — the two identities are
 * independent by construction, and signing out of the console is not a statement
 * about the gym sessions.
 *
 * A full assignment rather than the router: the session it would navigate with
 * is the one just deleted.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  const onClick = useCallback(() => {
    setPending(true);
    void (async () => {
      await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {
        // A failed clear still ends at the sign-in page, where the middleware
        // re-checks the cookie — so there is nothing useful to report here.
      });
      window.location.assign('/login');
    })();
  }, []);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      label={pending ? 'Signing out…' : 'Sign out'}
      isDisabled={pending}
      onClick={onClick}
      xstyle={styles.button}
    />
  );
}
