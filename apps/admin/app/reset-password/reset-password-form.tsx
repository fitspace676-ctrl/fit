'use client';

import { type FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPassword } from '@/lib/password-recovery';
import { Banner, Button, Field, Form, spacing } from '@fit/ui-kit';

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A malformed or expired link (no token) can never succeed — surface the
  // recoverable message instead of an unusable form.
  // Where a dead link sends the person: the form that mails a fresh one.
  const requestNew = (
    <Link href="/forgot-password" style={{ fontWeight: 600 }}>
      {t('reset.requestNew')}
    </Link>
  );

  if (!token) {
    return (
      <>
        <Banner tone="error">{t('reset.missingToken')}</Banner>
        {requestNew}
      </>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    resetPassword(token, password)
      .then((result) => {
        const destination = result.sessionIssued ? '/dashboard' : '/login?reset=done';
        router.replace(destination);
      })
      .catch(() => {
        setPending(false);
        setError(t('genericError'));
      });
  };

  return (
    <Form onSubmit={onSubmit}>
      {error ? (
        <>
          <Banner tone="error">{error}</Banner>
          {requestNew}
        </>
      ) : null}

      <Field
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

      <Button
        type="submit"
        variant="primary"
        size="door"
        fullWidth
        loading={pending}
        label={pending ? t('reset.submitting') : t('reset.submit')}
        xstyle={spacing.formAction}
      />
    </Form>
  );
}
