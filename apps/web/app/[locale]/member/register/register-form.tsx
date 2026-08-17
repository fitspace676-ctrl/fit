'use client';

import { type FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { registerWithCredentials } from '@/lib/auth';
import { Banner, Button, Field, Form, spacing } from '@/src/components/ui/kit';

/**
 * Account-creation form (name + email + password). Registration does not issue
 * a session — the API emails a verification link first — so on success we swap
 * the form for a "check your inbox" verification notice rather than redirecting.
 * Errors (e.g. an already-registered email) surface the API's message inline.
 *
 * The fields, submit and banners come from the portal's kit (`ui/kit`),
 * shared with sign-in, forgot-password and reset-password. It replaced Astryx
 * `TextInput` / `InputGroup` / `Button` here: those render a different field
 * than the other three auth screens (a larger sentence-case label, its own
 * vertical rhythm, the reveal button parked outside the control), which made
 * account-creation the one door in the flow that looked like another product.
 * The server action, invite-token forwarding and success flow are unchanged.
 */
export function RegisterForm() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  // Carried from a staff invite link (T4.7): `/member/register?inviteToken=…`. Forwarded
  // to the API so completing registration redeems the invite onto the new account.
  const inviteToken = searchParams.get('inviteToken') ?? undefined;

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
    registerWithCredentials({ name, email, password, inviteToken })
      .then(() => setDone(true))
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('genericError'));
      });
  };

  if (done) {
    return <Banner tone="success">{t('register.success')}</Banner>;
  }

  return (
    <Form onSubmit={onSubmit}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Field
        label={t('fields.name')}
        type="text"
        name="name"
        autoComplete="name"
        placeholder={t('fields.namePlaceholder')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={pending}
      />

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
        autoComplete="new-password"
        placeholder={t('fields.passwordPlaceholder')}
        hint={t('fields.passwordHint')}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
        revealLabels={{ show: t('showPassword'), hide: t('hidePassword') }}
      />

      <Button
        type="submit"
        variant="primary"
        size="door"
        fullWidth
        loading={pending}
        label={pending ? t('register.submitting') : t('register.submit')}
        xstyle={spacing.formAction}
      />
    </Form>
  );
}
