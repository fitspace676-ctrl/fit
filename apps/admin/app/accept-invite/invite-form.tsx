'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Banner, Button, Field, Form } from '@fit/ui-kit';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, type TokenPair } from '@fit/types';
import { browserTenantHeaders } from '@/lib/tenant-host';
import { adminPath } from '@/lib/base-path';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
type Invitation = {
  email: string;
  gymName: string;
  needsPassword: boolean;
  forgotPasswordUrl: string;
};

export function InviteForm() {
  const t = useTranslations('admin.invite');
  const tAuth = useTranslations('auth');
  const token = useSearchParams().get('token');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [invalid, setInvalid] = useState(!token);
  const [error, setError] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pair, setPair] = useState<TokenPair | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void fetch(`${API_URL}/auth/staff-invite?token=${encodeURIComponent(token)}`, {
      headers: browserTenantHeaders(),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 400) setInvalid(true);
          else setError(true);
          return;
        }
        setInvitation((await response.json()) as Invitation);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(false);
    setWrongPassword(false);
    try {
      let tokens = pair;
      if (!tokens) {
        const response = await fetch(`${API_URL}/auth/accept-invite`, {
          method: 'POST',
          headers: { ...browserTenantHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            ...(invitation?.needsPassword ? { password } : { currentPassword: password }),
          }),
        });
        if (!response.ok) {
          if (response.status === 401) setWrongPassword(true);
          else if (response.status === 400) setInvalid(true);
          else setError(true);
          return;
        }
        tokens = (await response.json()) as TokenPair;
        setPair(tokens);
      }
      // Retry cookie storage without spending the already accepted invitation again.
      const session = await fetch(adminPath('/api/session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens),
      });
      if (!session.ok) throw new Error('session');
      window.location.replace(adminPath('/dashboard'));
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  if (invalid)
    return (
      <Banner tone="error">
        {t('invalid')} {t('requestNew')}
      </Banner>
    );
  if (!invitation)
    return <Banner tone={error ? 'error' : 'info'}>{t(error ? 'error' : 'loading')}</Banner>;

  return (
    <Form
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <p>
        {invitation.gymName} · {invitation.email}
      </p>
      {error ? <Banner tone="error">{t('error')}</Banner> : null}
      {wrongPassword ? <Banner tone="error">{t('wrongPassword')}</Banner> : null}
      {invitation.needsPassword && !pair ? (
        <>
          <Field
            label={t('password')}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={password}
            disabled={pending}
            onChange={(event) => setPassword(event.target.value)}
            revealLabels={{ show: tAuth('showPassword'), hide: tAuth('hidePassword') }}
          />
          <Field
            label={t('confirm')}
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={confirm}
            disabled={pending}
            onChange={(event) => setConfirm(event.target.value)}
            revealLabels={{ show: tAuth('showPassword'), hide: tAuth('hidePassword') }}
          />
          {confirm && password !== confirm ? <Banner tone="error">{t('mismatch')}</Banner> : null}
        </>
      ) : (
        !pair && (
          <>
            <p>{t('confirmExisting', { gym: invitation.gymName })}</p>
            <Field
              label={t('currentPassword')}
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={PASSWORD_MAX_LENGTH}
              value={password}
              disabled={pending}
              onChange={(event) => setPassword(event.target.value)}
              revealLabels={{ show: tAuth('showPassword'), hide: tAuth('hidePassword') }}
            />
            <Link href={`/forgot-password?email=${encodeURIComponent(invitation.email)}`}>
              {t('forgotPassword')}
            </Link>
          </>
        )
      )}
      <Button
        type="submit"
        variant="primary"
        size="door"
        fullWidth
        loading={pending}
        disabled={
          pending ||
          (!pair &&
            (invitation.needsPassword
              ? password.length < PASSWORD_MIN_LENGTH || password !== confirm
              : !password))
        }
        label={t(pending ? 'submitting' : 'submit')}
      />
    </Form>
  );
}
