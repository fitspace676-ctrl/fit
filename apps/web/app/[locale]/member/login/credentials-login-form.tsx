'use client';

import { type FormEvent, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginWithCredentials, postLoginPath } from '@/lib/auth';
import { Link } from '@/src/i18n/navigation';
import { AuthBanner, AuthField, AuthForm, AuthSubmit } from '../../_components/auth/auth-form-kit';

/**
 * Only honour a `from` redirect that is a same-origin absolute path
 * (`/en/classes`) — never a protocol-relative (`//evil.com`) or absolute URL,
 * which would turn the login flow into an open redirect.
 */
function safeFrom(from: string | null): string | null {
  if (!from) return null;
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return null;
  return from;
}

// The fields, the submit and the error banner come from
// `_components/auth/auth-form-kit`, which the forgot-password, reset-password
// and register forms mount too. That kit IS the artboard's field — a 52px
// control over a 10px tracked micro-label whose row carries an inline action,
// with the reveal button inset over the field's right edge — so every auth
// screen shares one vocabulary and it changes in one place.

const styles = stylex.create({
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
 * Email + password sign-in form. On success the API issues a session (persisted
 * as httpOnly cookies by {@link loginWithCredentials}) and we send the user to
 * the `from` path the middleware stashed when it bounced them here, falling back
 * to the locale home. Errors surface the API's message inline.
 */
export function CredentialsLoginForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Carried from a staff invite link (T4.7): `/member/login?inviteToken=…` when the
  // invited address already has an account. Forwarded to the API so signing in
  // redeems the invite onto it. `inviteError` flags an invalid / expired link.
  const inviteToken = searchParams.get('inviteToken') ?? undefined;
  const inviteError = searchParams.get('inviteError');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(inviteError ? t('invite.invalid') : null);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    loginWithCredentials(email, password, inviteToken)
      .then(async () => {
        const destination = await postLoginPath(safeFrom(searchParams.get('from')), locale);
        router.replace(destination);
      })
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('genericError'));
      });
  };

  return (
    <AuthForm onSubmit={onSubmit}>
      {error ? <AuthBanner tone="error">{error}</AuthBanner> : null}

      <AuthField
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

      <AuthField
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
          <Link href="/member/forgot-password" {...stylex.props(styles.forgot)}>
            {t('login.forgotPassword')}
          </Link>
        }
      />

      <AuthSubmit pending={pending}>
        {pending ? t('login.submitting') : t('login.submit')}
      </AuthSubmit>
    </AuthForm>
  );
}
