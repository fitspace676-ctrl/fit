'use client';

import { type FormEvent, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { InputGroup } from '@astryxdesign/core/InputGroup';
import { TextInput } from '@astryxdesign/core/TextInput';
import { postLoginPath, resetPassword } from '@/lib/auth';
import { Icon } from '@/src/components/ui';

/**
 * Set-a-new-password form reached from the emailed reset link
 * (`/reset-password?token=…`). It reads the single-use `token` from the query
 * string and, on submit, posts it with the chosen password to the API. A
 * successful reset revokes every existing session and issues a fresh session
 * (persisted as httpOnly cookies by {@link resetPassword}), so the user walks
 * away signed in — we send them to the post-login destination, mirroring the
 * login form. A missing/blank token means a malformed or stale link, so we show
 * the recoverable error and never render the form.
 *
 * Astryx migration (T11.9): built on Astryx `TextInput`, an `InputGroup` pairing
 * the password field with an `IconButton` show/hide toggle, and a primary
 * `Button`; the inline error banner and layout are compiled StyleX on the Fit
 * theme tokens — no Tailwind.
 */
const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  banner: {
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
  bannerIcon: {
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

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A malformed or expired link (no token) can never succeed — surface the
  // recoverable message instead of an unusable form.
  if (!token) {
    return (
      <p role="alert" {...stylex.props(styles.banner)}>
        <Icon name="info" {...stylex.props(styles.bannerIcon)} sw={2.2} />
        {t('reset.missingToken')}
      </p>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    resetPassword(token, password)
      .then(async () => {
        const destination = await postLoginPath(null, locale);
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
        <p role="alert" {...stylex.props(styles.banner)}>
          <Icon name="info" {...stylex.props(styles.bannerIcon)} sw={2.2} />
          {error}
        </p>
      ) : null}

      <InputGroup label={t('fields.password')} description={t('fields.passwordHint')} size="lg">
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
        label={pending ? t('reset.submitting') : t('reset.submit')}
        isLoading={pending}
        isDisabled={pending}
        xstyle={styles.submit}
      />
    </form>
  );
}
