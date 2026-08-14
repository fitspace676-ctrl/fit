'use client';

import { type FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestPasswordReset } from '@/lib/auth';
import { AuthBanner, AuthField, AuthForm, AuthSubmit } from '../../_components/auth/auth-form-kit';

/**
 * Password-reset request form. The API's response is deliberately generic — it
 * never reveals whether the address is registered — so on success we surface the
 * returned `message` as-is rather than implying an account exists.
 *
 * FormaCore redesign: rebuilt on the shared auth controls, so the email field
 * and the submit are the same objects the sign-in form renders. Only the fields
 * differ between the two screens; nothing about the frame or the controls does.
 * Submit behaviour and the generic-message contract are unchanged.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('auth');

  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    requestPasswordReset(email)
      .then(() => setSent(true))
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('genericError'));
      });
  };

  // Once the link is on its way there is nothing left to fill in — the form is
  // replaced rather than left standing beside its own confirmation.
  //
  // The confirmation is OUR string, not the API's. `POST /auth/forgot-password`
  // answers with one hardcoded English sentence — deliberately constant, so it
  // never reveals whether the address is registered — and rendering it verbatim
  // put an English line in the middle of a Georgian page. `auth.forgot.sent` is
  // that same sentence, translated, and it has been sitting unused in the
  // catalogue. Saying it ourselves keeps the generic contract (the copy does not
  // vary with the answer) and keeps the page in one language.
  if (sent) {
    return <AuthBanner tone="success">{t('forgot.sent')}</AuthBanner>;
  }

  return (
    <AuthForm onSubmit={onSubmit}>
      {error ? <AuthBanner tone="error">{error}</AuthBanner> : null}

      <AuthField
        label={t('fields.email')}
        type="email"
        name="email"
        autoComplete="email"
        required
        placeholder={t('fields.emailPlaceholder')}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
        invalid={error !== null}
      />

      <AuthSubmit pending={pending}>
        {pending ? t('forgot.submitting') : t('forgot.submit')}
      </AuthSubmit>
    </AuthForm>
  );
}
