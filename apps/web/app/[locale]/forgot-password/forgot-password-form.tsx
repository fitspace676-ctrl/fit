'use client';

import { type FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestPasswordReset } from '@/lib/auth';
import { FormError, FormSuccess, SubmitButton, TextField } from '../_components/auth/form-controls';

/**
 * Password-reset request form. The API's response is deliberately generic — it
 * never reveals whether the address is registered — so on success we surface
 * the returned `message` as-is rather than implying an account exists.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('auth');

  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    requestPasswordReset(email)
      .then((res) => setMessage(res.message))
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('genericError'));
      });
  };

  if (message) {
    return <FormSuccess message={message} />;
  }

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
      <SubmitButton pending={pending} pendingLabel={t('forgot.submitting')}>
        {t('forgot.submit')}
      </SubmitButton>
    </form>
  );
}
