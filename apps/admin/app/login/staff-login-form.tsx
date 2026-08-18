'use client';

import { type FormEvent, useCallback, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Banner, Button, Field, Form, spacing } from '@fit/ui-kit';
import type { TokenPair } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** This app's basePath behind the tenant proxy, for building post-login targets. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '/admin';

const styles = stylex.create({
  // The "forgot?" mini-action on the password label row, exactly as the member
  // door draws it. An absolute path: recovery is the member site's reset flow
  // (one identity system), which lives outside this app's basePath.
  forgot: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: { default: 'var(--color-text-accent)', ':hover': 'var(--color-text-primary)' },
    textDecoration: 'none',
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
});

/**
 * The console's own credentials sign-in, on the shared kit's door controls -
 * the same `Field`, `Banner` and 56px submit the member door renders.
 *
 * Authenticates against the same `POST /auth/login` the member site uses - there
 * is one identity system, and this is only a second door into it - then hands
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
  const t = useTranslations('auth');
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
            throw new Error(detail?.message ?? t('genericError'));
          }

          const tokens = (await response.json()) as TokenPair;
          await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tokens),
            credentials: 'same-origin',
          });

          // Only same-origin paths are honoured - an absolute or scheme-relative
          // `?from` would make this an open redirect.
          const target = from && from.startsWith('/') && !from.startsWith('//') ? from : BASE_PATH;
          window.location.assign(target);
        } catch (err: unknown) {
          setPending(false);
          setError(err instanceof Error ? err.message : t('genericError'));
        }
      })();
    },
    [email, password, from, t],
  );

  return (
    <Form onSubmit={onSubmit}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Field
        label={t('fields.email')}
        type="email"
        name="email"
        autoComplete="email"
        placeholder={t('fields.emailPlaceholder')}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
        invalid={error !== null}
      />

      <Field
        label={t('fields.password')}
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder={t('fields.passwordPlaceholder')}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
        invalid={error !== null}
        revealLabels={{ show: t('showPassword'), hide: t('hidePassword') }}
        action={
          <a href="/member/forgot-password" {...stylex.props(styles.forgot)}>
            {t('login.forgotPassword')}
          </a>
        }
      />

      <Button
        type="submit"
        variant="primary"
        size="door"
        fullWidth
        loading={pending}
        label={pending ? t('login.submitting') : t('login.submit')}
        xstyle={spacing.formAction}
      />
    </Form>
  );
}
