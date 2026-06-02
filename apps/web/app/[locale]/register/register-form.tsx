'use client';

import { type FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { registerWithCredentials } from '@/lib/auth';
import { FormError, FormSuccess, SubmitButton, TextField } from '../_components/auth/form-controls';

/**
 * Account-creation form (name + email + password). Registration does not issue
 * a session — the API emails a verification link first — so on success we swap
 * the form for a "check your inbox" notice rather than redirecting. Errors
 * (e.g. an already-registered email) surface the API's message inline.
 */
export function RegisterForm() {
  const t = useTranslations('auth');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    registerWithCredentials({ name, email, password })
      .then(() => setDone(true))
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('genericError'));
      });
  };

  if (done) {
    return <FormSuccess message={t('register.success')} />;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError message={error} />
      <TextField
        label={t('fields.name')}
        type="text"
        name="name"
        autoComplete="name"
        required
        placeholder={t('fields.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
      />
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
        autoComplete="new-password"
        required
        minLength={8}
        placeholder={t('fields.passwordPlaceholder')}
        hint={t('fields.passwordHint')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={pending}
      />
      <SubmitButton pending={pending} pendingLabel={t('register.submitting')}>
        {t('register.submit')}
      </SubmitButton>
    </form>
  );
}
