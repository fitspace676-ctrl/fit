'use client';

import { type FormEvent, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginWithCredentials } from '@/lib/auth';
import { FormError, SubmitButton, TextField } from '../_components/auth/form-controls';

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

  // Carried from a staff invite link (T4.7): `/login?inviteToken=…` when the
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
      .then(() => {
        const destination = safeFrom(searchParams.get('from')) ?? `/${locale}`;
        router.replace(destination);
      })
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('genericError'));
      });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError message={error} />
      <TextField
        label={t('fields.email')}
        type="email"
        name="email"
        autoComplete="email"
        required
        placeholder={t('fields.emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
      />
      <TextField
        label={t('fields.password')}
        type="password"
        name="password"
        autoComplete="current-password"
        required
        placeholder={t('fields.passwordPlaceholder')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={pending}
      />
      <SubmitButton pending={pending} pendingLabel={t('login.submitting')}>
        {t('login.submit')}
      </SubmitButton>
    </form>
  );
}
