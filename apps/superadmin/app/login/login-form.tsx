'use client';

import { type FormEvent, useCallback, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { TokenPair } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  error: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    margin: 0,
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
    backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-error) 30%, transparent)',
  },
  submit: {
    width: '100%',
    marginTop: '0.25rem',
  },
});

/**
 * The operator console's credentials sign-in.
 *
 * Authenticates against the same `POST /auth/login` every other surface uses —
 * there is one identity system, and this is only another door into it. **No
 * `gymSlug` is sent**, unlike the staff console's form: the API scopes a
 * `User.isSuperAdmin` account to `{ gymId: null, role: SUPER_ADMIN }` outright
 * (`AuthService.resolveSessionScope`), which is exactly the cross-tenant session
 * this console needs. A non-operator signing in here gets a perfectly valid
 * tenant session and is then turned away by `middleware.ts` at `/403` — the
 * failure is one of authorization, and it belongs there rather than here.
 *
 * The issued pair goes to `POST /api/session`, which stores it as host-only
 * httpOnly cookies. The tokens are never written anywhere client JS can read
 * them back.
 */
export function OperatorLoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPending(true);
      setError(null);

      void (async () => {
        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          if (!response.ok) {
            const detail = (await response.json().catch(() => null)) as { message?: string } | null;
            throw new Error(detail?.message ?? `Sign-in failed (${response.status})`);
          }

          const tokens = (await response.json()) as TokenPair;
          await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tokens),
            credentials: 'same-origin',
          });

          // Only same-origin paths are honoured — an absolute or scheme-relative
          // `?from` would make this an open redirect. A full assignment rather
          // than the router, so the middleware re-runs against the fresh cookie
          // and decides whether this account may see the target at all.
          const target = from && from.startsWith('/') && !from.startsWith('//') ? from : '/';
          window.location.assign(target);
        } catch (err: unknown) {
          setPending(false);
          setError(err instanceof Error ? err.message : 'Sign-in failed');
        }
      })();
    },
    [email, password, from],
  );

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}

      <TextInput
        type="email"
        label="Email"
        htmlName="email"
        size="lg"
        placeholder="you@example.com"
        value={email}
        onChange={(value) => setEmail(value)}
        isRequired
        isDisabled={pending}
      />

      <TextInput
        type="password"
        label="Password"
        htmlName="password"
        size="lg"
        placeholder="••••••••"
        value={password}
        onChange={(value) => setPassword(value)}
        isRequired
        isDisabled={pending}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        label={pending ? 'Signing in…' : 'Sign in'}
        isLoading={pending}
        isDisabled={pending}
        xstyle={styles.submit}
      />
    </form>
  );
}
