'use client';

import { type FormEvent, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Banner, Button, Field, Form, spacing } from '@fit/ui-kit';
import { PASSWORD_MIN_LENGTH, type ActivateAccountResponse } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * The gym owner's one-time activation form: a password, its confirmation, and a
 * single `POST /auth/activate` carrying them with the token from the link.
 *
 * That one request verifies the address AND writes the first password, so the
 * owner can never end up in the half-state the old flow left behind - an address
 * confirmed on an account the operator console provisioned with no password at
 * all, and therefore nothing to sign in with.
 *
 * **It ends on the sign-in page, not in the console.** The API answers with the
 * address and no session, deliberately: the owner types the password they have
 * just chosen and their first sign-in is a real one, which also means a link
 * forwarded to the wrong inbox hands nobody a live console. `?activated=1` tells
 * that page to confirm the password took; `?email=` fills the first field.
 *
 * The token is single-use and consumed the moment the API accepts it, so a failed
 * attempt is final - the error copy says to ask for a fresh link rather than
 * inviting a retry that cannot work.
 */
export function ActivateForm() {
  const t = useTranslations('admin.activate');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!token) {
        setError(t('missingToken'));
        return;
      }
      // Checked here as well as by the API's schema: the mismatch and the length
      // are both things the owner can see for themselves, and spending the
      // single-use token to be told either would be unrecoverable.
      if (password.length < PASSWORD_MIN_LENGTH) {
        setError(t('tooShort', { min: PASSWORD_MIN_LENGTH }));
        return;
      }
      if (password !== confirm) {
        setError(t('mismatch'));
        return;
      }

      setPending(true);
      setError(null);

      void (async () => {
        try {
          const response = await fetch(`${API_URL}/auth/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password }),
          });
          if (!response.ok) {
            const detail = (await response.json().catch(() => null)) as {
              code?: string;
              message?: string;
            } | null;
            throw new Error(
              detail?.code === 'TOKEN_INVALID_OR_EXPIRED'
                ? t('invalidToken')
                : (detail?.message ?? tAuth('genericError')),
            );
          }

          const { email } = (await response.json()) as ActivateAccountResponse;
          // `router.replace` (not `assign`): there is no cookie to make the
          // middleware re-read, and replacing keeps the spent token out of the
          // back-button history.
          router.replace(`/login?email=${encodeURIComponent(email)}&activated=1`);
        } catch (err: unknown) {
          setPending(false);
          setError(err instanceof Error ? err.message : tAuth('genericError'));
        }
      })();
    },
    [token, password, confirm, router, t, tAuth],
  );

  // A link with no token at all is broken before anything is typed - say so
  // instead of drawing a form whose only outcome is that same message.
  if (!token) {
    return <Banner tone="error">{t('missingToken')}</Banner>;
  }

  return (
    <Form onSubmit={onSubmit}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Field
        label={t('passwordLabel')}
        type="password"
        name="password"
        autoComplete="new-password"
        placeholder={tAuth('fields.passwordPlaceholder')}
        hint={tAuth('fields.passwordHint')}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
        invalid={error !== null}
        revealLabels={{ show: tAuth('showPassword'), hide: tAuth('hidePassword') }}
      />

      <Field
        label={t('confirmLabel')}
        type="password"
        name="confirmPassword"
        autoComplete="new-password"
        placeholder={tAuth('fields.passwordPlaceholder')}
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        disabled={pending}
        invalid={error !== null}
        revealLabels={{ show: tAuth('showPassword'), hide: tAuth('hidePassword') }}
      />

      <Button
        type="submit"
        variant="primary"
        size="door"
        fullWidth
        loading={pending}
        label={pending ? t('submitting') : t('submit')}
        xstyle={spacing.formAction}
      />
    </Form>
  );
}
