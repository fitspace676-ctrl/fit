'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestPasswordReset } from '@/lib/password-recovery';
import { Banner, Button, Field, Form, spacing } from '@fit/ui-kit';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');

  const [email, setEmail] = useState('');
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setEmail(query.get('email') ?? '');
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    requestPasswordReset(email)
      .then(() => setSent(true))
      .catch(() => {
        setPending(false);
        setError(t('genericError'));
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
    return <Banner tone="success">{t('forgot.sent')}</Banner>;
  }

  return (
    <Form onSubmit={onSubmit}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Field
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

      <Button
        type="submit"
        variant="primary"
        size="door"
        fullWidth
        loading={pending}
        label={pending ? t('forgot.submitting') : t('forgot.submit')}
        xstyle={spacing.formAction}
      />
    </Form>
  );
}
