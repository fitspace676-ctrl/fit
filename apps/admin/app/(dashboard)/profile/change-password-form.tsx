'use client';

import { useState, type FormEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Banner, Button, Card, Field, Form } from '@fit/ui-kit';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '@fit/types';
import { useToast } from '@/components/ui';
import { changePasswordAction } from './actions';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  title: { margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)' },
  description: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
});

export function ChangePasswordForm() {
  const t = useTranslations('admin.profile.password');
  const tAuth = useTranslations('auth');
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError('mismatch');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await changePasswordAction({ currentPassword, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
      toast(t('success'), { tone: 'success', icon: 'check' });
    } catch {
      setError('error');
    } finally {
      setPending(false);
    }
  }
  return (
    <Card padding="sm" xstyle={styles.card}>
      <h2 {...stylex.props(styles.title)}>{t('title')}</h2>
      <p {...stylex.props(styles.description)}>{t('description')}</p>
      <Form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {error && <Banner tone="error">{t(error)}</Banner>}
        <Field
          label={t('current')}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={PASSWORD_MAX_LENGTH}
          value={currentPassword}
          disabled={pending}
          onChange={(event) => setCurrentPassword(event.target.value)}
          revealLabels={{ show: tAuth('showPassword'), hide: tAuth('hidePassword') }}
        />
        <Field
          label={t('new')}
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
        {confirm && password !== confirm && <Banner tone="error">{t('mismatch')}</Banner>}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          disabled={
            pending ||
            !currentPassword ||
            password.length < PASSWORD_MIN_LENGTH ||
            password !== confirm
          }
          label={t(pending ? 'saving' : 'submit')}
        />
      </Form>
    </Card>
  );
}
