'use client';

import { type FormEvent, useCallback, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { TokenPair } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** This app's basePath behind the tenant proxy, for building post-login targets. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '/admin';

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
 * The console's own credentials sign-in.
 *
 * Authenticates against the same `POST /auth/login` the member site uses — there
 * is one identity system, and this is only a second door into it — then hands
 * the issued pair to the console's `POST /api/session`, which stores it as
 * httpOnly cookies. The tokens are never written anywhere client JS can read
 * them back.
 *
 * **The gym is taken from the subdomain**, not typed: `<slug>.<root>/admin`
 * means "sign me into this gym", so the slug is forwarded as `gymSlug` and the
 * session binds to that tenant rather than to whichever gym the operator joined
 * first. An operator who is not a member of the named gym falls back to their
 * primary one, exactly as the member site behaves.
 *
 * After signing in the operator lands on the console path the middleware stashed
 * in `?from` (already basePath-prefixed when it bounced them), or the dashboard
 * root. Redirect uses a full assignment rather than the router: the middleware
 * must re-run against the freshly-set cookie to decide whether this operator may
 * see the target at all.
 */
export function StaffLoginForm() {
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

      // `<slug>.<root>` → `slug`. A bare host (localhost, an apex preview) has no
      // tenant label, so the field is omitted and the API picks the primary gym.
      const [label] = window.location.hostname.split('.');
      const gymSlug = label && label !== 'localhost' && label !== 'www' ? label : undefined;

      void (async () => {
        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, ...(gymSlug ? { gymSlug } : {}) }),
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
          // `?from` would make this an open redirect.
          const target = from && from.startsWith('/') && !from.startsWith('//') ? from : BASE_PATH;
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
