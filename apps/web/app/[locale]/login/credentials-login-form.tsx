'use client';

import { type FormEvent, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { InputGroup } from '@astryxdesign/core/InputGroup';
import { TextInput } from '@astryxdesign/core/TextInput';
import { loginWithCredentials, postLoginPath } from '@/lib/auth';
import { Icon } from '@/src/components/ui';

/**
 * Only honour a `from` redirect that is a same-origin absolute path
 * (`/en/classes`) — never a protocol-relative (`//evil.com`) or absolute URL,
 * which would turn the login flow into an open redirect.
 */
function safeFrom(from: string | null): string | null {
  if (!from) return null;
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return null;
  return from;
}

// Astryx migration (T11.7): the form is rebuilt on Astryx `TextInput` (email +
// password), an `InputGroup` pairing the password field with an `IconButton`
// show/hide toggle, and an Astryx primary `Button`. The error banner and layout
// are compiled StyleX on the Fit theme tokens — no Tailwind. All submit / OAuth
// behaviour is unchanged from the formacore version.
const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  error: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
    backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-error) 30%, transparent)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    flexShrink: 0,
    width: '1rem',
    height: '1rem',
  },
  submit: {
    width: '100%',
    marginTop: '0.25rem',
  },
});

/**
 * Email + password sign-in form. On success the API issues a session (persisted
 * as httpOnly cookies by {@link loginWithCredentials}) and we send the user to
 * the `from` path the middleware stashed when it bounced them here, falling back
 * to the locale home. Errors surface the API's message inline.
 */
export function CredentialsLoginForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Carried from a staff invite link (T4.7): `/login?inviteToken=…` when the
  // invited address already has an account. Forwarded to the API so signing in
  // redeems the invite onto it. `inviteError` flags an invalid / expired link.
  const inviteToken = searchParams.get('inviteToken') ?? undefined;
  const inviteError = searchParams.get('inviteError');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(inviteError ? t('invite.invalid') : null);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    loginWithCredentials(email, password, inviteToken)
      .then(async () => {
        const destination = await postLoginPath(safeFrom(searchParams.get('from')), locale);
        router.replace(destination);
      })
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('genericError'));
      });
  };

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} sw={2.2} />
          {error}
        </p>
      ) : null}

      <TextInput
        type="email"
        label={t('fields.email')}
        htmlName="email"
        size="lg"
        placeholder={t('fields.emailPlaceholder')}
        value={email}
        onChange={(value) => setEmail(value)}
        isDisabled={pending}
      />

      <InputGroup label={t('fields.password')} size="lg">
        <TextInput
          type={showPassword ? 'text' : 'password'}
          label={t('fields.password')}
          isLabelHidden
          htmlName="password"
          placeholder={t('fields.passwordPlaceholder')}
          value={password}
          onChange={(value) => setPassword(value)}
          isDisabled={pending}
        />
        <IconButton
          variant="ghost"
          label={showPassword ? t('hidePassword') : t('showPassword')}
          icon={<Icon name={showPassword ? 'eyeOff' : 'eye'} />}
          onClick={() => setShowPassword((prev) => !prev)}
          isDisabled={pending}
        />
      </InputGroup>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        label={pending ? t('login.submitting') : t('login.submit')}
        isLoading={pending}
        isDisabled={pending}
        xstyle={styles.submit}
      />
    </form>
  );
}
