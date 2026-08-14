'use client';

import { type FormEvent, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { postLoginPath, resetPassword } from '@/lib/auth';
import { AuthBanner, AuthField, AuthForm, AuthSubmit } from '../../_components/auth/auth-form-kit';

/**
 * Set-a-new-password form reached from the emailed reset link
 * (`/member/reset-password?token=…`). It reads the single-use `token` from the query
 * string and, on submit, posts it with the chosen password to the API. A
 * successful reset revokes every existing session and issues a fresh session
 * (persisted as httpOnly cookies by {@link resetPassword}), so the user walks
 * away signed in — we send them to the post-login destination, mirroring the
 * login form. A missing/blank token means a malformed or stale link, so we show
 * the recoverable error and never render the form.
 *
 * FormaCore redesign: rebuilt on the shared auth controls — the password field,
 * its reveal button and the submit are the same objects the sign-in form
 * renders, so the two screens differ only in what they ask for.
 */
export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A malformed or expired link (no token) can never succeed — surface the
  // recoverable message instead of an unusable form.
  if (!token) {
    return <AuthBanner tone="error">{t('reset.missingToken')}</AuthBanner>;
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    resetPassword(token, password)
      .then(async () => {
        const destination = await postLoginPath(null, locale);
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
        label={t('fields.password')}
        type="password"
        name="password"
        // A new password, not the stored one — telling the password manager
        // which is which is what makes it offer to update the saved entry.
        autoComplete="new-password"
        required
        minLength={8}
        placeholder={t('fields.passwordPlaceholder')}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
        invalid={error !== null}
        revealLabels={{ show: t('showPassword'), hide: t('hidePassword') }}
        // The rule the API enforces, stated before it can be broken rather than
        // after — this is the one field in the product with a length minimum.
        hint={t('fields.passwordHint')}
      />

      <AuthSubmit pending={pending}>
        {pending ? t('reset.submitting') : t('reset.submit')}
      </AuthSubmit>
    </AuthForm>
  );
}
