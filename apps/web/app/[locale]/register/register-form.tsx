'use client';

import { type FormEvent, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { InputGroup } from '@astryxdesign/core/InputGroup';
import { TextInput } from '@astryxdesign/core/TextInput';
import { registerWithCredentials } from '@/lib/auth';
import { Icon } from '@/src/components/ui';

/**
 * Account-creation form (name + email + password). Registration does not issue
 * a session — the API emails a verification link first — so on success we swap
 * the form for a "check your inbox" verification notice rather than redirecting.
 * Errors (e.g. an already-registered email) surface the API's message inline.
 *
 * Astryx migration (T11.8): rebuilt on Astryx `TextInput` (name + email), an
 * `InputGroup` pairing the password field with an `IconButton` show/hide toggle,
 * and an Astryx primary `Button`; the inline error banner and the post-signup
 * verification notice are compiled StyleX on the Fit theme tokens — no Tailwind.
 * The server action, invite-token forwarding and success flow are unchanged from
 * the formacore version.
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

export function RegisterForm() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  // Carried from a staff invite link (T4.7): `/register?inviteToken=…`. Forwarded
  // to the API so completing registration redeems the invite onto the new account.
  const inviteToken = searchParams.get('inviteToken') ?? undefined;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    return (
      <p role="status" {...stylex.props(styles.banner, styles.success)}>
        <Icon name="check" {...stylex.props(styles.bannerIcon)} sw={2.4} />
        {t('register.success')}
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
        type="text"
        label={t('fields.name')}
        htmlName="name"
        size="lg"
        placeholder={t('fields.namePlaceholder')}
        value={name}
        onChange={(value) => setName(value)}
        isDisabled={pending}
      />

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
        label={pending ? t('register.submitting') : t('register.submit')}
        isLoading={pending}
        isDisabled={pending}
        xstyle={styles.submit}
      />
    </form>
  );
}
