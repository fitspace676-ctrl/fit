'use client';

import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { RegisterGymInput, RegisterGymResponse } from '@fit/types';
import { registerGym } from '@/lib/register-gym';
import { slugifyGymName } from '@/lib/slugify';
import { tenantAdminUrl } from '@/lib/tenant-url';
import { FormError, SubmitButton, TextField } from './form-controls';

/** Minimum password length the API enforces (mirrors `PASSWORD_MIN_LENGTH`). */
const PASSWORD_MIN_LENGTH = 8;

/** The emphasised email / gym name inside the success copy. */
const strong = (chunks: ReactNode): ReactNode => <span className="font-medium">{chunks}</span>;

/**
 * Gym-owner signup form. Collects the gym name + subdomain, the owner's email
 * (and optional name + password), and posts them to `POST /auth/register-gym`.
 * Provisioning does NOT issue a session — the API emails the owner a
 * verification link first — so on success the form swaps to a "check your inbox"
 * confirmation that links on to the freshly provisioned tenant console rather
 * than redirecting straight there. The subdomain is auto-suggested from the gym
 * name until the owner edits it themselves.
 */
export function RegisterGymForm() {
  const t = useTranslations('signup');
  const [gymName, setGymName] = useState('');
  const [subdomainSlug, setSubdomainSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RegisterGymResponse | null>(null);

  const onGymNameChange = (value: string): void => {
    setGymName(value);
    // Keep the subdomain in lockstep with the name until the owner takes it over.
    if (!slugEdited) setSubdomainSlug(slugifyGymName(value));
  };

  const onSlugChange = (value: string): void => {
    setSlugEdited(true);
    // Constrain to DNS-label characters as they type so the field never shows
    // something the API would reject outright.
    setSubdomainSlug(slugifyGymName(value));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const trimmedName = ownerName.trim();
    const input: RegisterGymInput = {
      gymName: gymName.trim(),
      subdomainSlug,
      ownerEmail: ownerEmail.trim(),
      // Both optional in the contract — omit rather than send empty strings.
      ...(trimmedName ? { ownerName: trimmedName } : {}),
      ...(password ? { password } : {}),
    };

    registerGym(input, {
      signupFailed: (status) => t('errors.signupFailed', { status }),
    })
      .then((response) => setDone(response))
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('errors.generic'));
      });
  };

  if (done) {
    const adminUrl = tenantAdminUrl(done.subdomainSlug);
    return (
      <div className="flex flex-col gap-4 text-left">
        <div className="rounded-card bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          <p className="font-semibold">{t('success.title')}</p>
          <p className="mt-1">
            {t.rich('success.body', { email: ownerEmail, gym: gymName, b: strong })}
          </p>
        </div>
        {adminUrl ? (
          <a
            href={adminUrl}
            className="rounded-card bg-brand-600 px-6 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            {t('success.console')}
          </a>
        ) : (
          <p className="text-sm text-slate-500">
            {t.rich('success.verifyFirst', {
              slug: done.subdomainSlug,
              b: (chunks) => <span className="font-medium text-slate-700">{chunks}</span>,
            })}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError message={error} />
      <TextField
        label={t('form.gymName')}
        type="text"
        name="gymName"
        autoComplete="organization"
        required
        maxLength={100}
        placeholder={t('form.gymNamePlaceholder')}
        value={gymName}
        onChange={(e) => onGymNameChange(e.target.value)}
        disabled={pending}
      />
      <TextField
        label={t('form.subdomain')}
        type="text"
        name="subdomainSlug"
        required
        minLength={3}
        maxLength={40}
        placeholder={t('form.subdomainPlaceholder')}
        suffix=".fit.ge"
        hint={t('form.subdomainHint')}
        value={subdomainSlug}
        onChange={(e) => onSlugChange(e.target.value)}
        disabled={pending}
      />
      <TextField
        label={t('form.ownerName')}
        type="text"
        name="ownerName"
        autoComplete="name"
        maxLength={100}
        placeholder={t('form.ownerNamePlaceholder')}
        value={ownerName}
        onChange={(e) => setOwnerName(e.target.value)}
        disabled={pending}
      />
      <TextField
        label={t('form.email')}
        type="email"
        name="ownerEmail"
        autoComplete="email"
        required
        placeholder={t('form.emailPlaceholder')}
        value={ownerEmail}
        onChange={(e) => setOwnerEmail(e.target.value)}
        disabled={pending}
      />
      <TextField
        label={t('form.password')}
        type="password"
        name="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        placeholder={t('form.passwordPlaceholder')}
        hint={t('form.passwordHint')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={pending}
      />
      <SubmitButton pending={pending} pendingLabel={t('form.submitting')}>
        {t('form.submit')}
      </SubmitButton>
    </form>
  );
}
