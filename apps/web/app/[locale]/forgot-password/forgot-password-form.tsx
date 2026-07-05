'use client';

import { type FormEvent, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { requestPasswordReset } from '@/lib/auth';
import { Icon } from '@/src/components/ui';

/**
 * Password-reset request form. The API's response is deliberately generic — it
 * never reveals whether the address is registered — so on success we surface the
 * returned `message` as-is rather than implying an account exists.
 *
 * Astryx migration (T11.9): rebuilt on the Astryx `TextInput` (email) and a
 * primary `Button`; the inline error banner and the post-request success notice
 * are compiled StyleX on the Fit theme tokens — no Tailwind and no dependency on
 * the old formacore form-controls. The submit behaviour and the generic-message
 * contract are unchanged from the formacore version.
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
  },
  error: {
    color: 'var(--color-error)',
    backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-error) 30%, transparent)',
  },
  success: {
    color: 'var(--color-success)',
    backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-success) 30%, transparent)',
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
    return (
      <p role="status" {...stylex.props(styles.banner, styles.success)}>
        <Icon name="check" {...stylex.props(styles.bannerIcon)} sw={2.4} />
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {error ? (
        <p role="alert" {...stylex.props(styles.banner, styles.error)}>
          <Icon name="info" {...stylex.props(styles.bannerIcon)} sw={2.2} />
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

      <Button
        type="submit"
        variant="primary"
        size="lg"
        label={pending ? t('forgot.submitting') : t('forgot.submit')}
        isLoading={pending}
        isDisabled={pending}
        xstyle={styles.submit}
      />
    </form>
  );
}
