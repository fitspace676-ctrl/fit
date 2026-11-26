'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Button, Card } from '@fit/ui-kit';
import { Input, Label } from '@/components/ui';
import { setMemberAccessCardSchema } from '@fit/types';
import { setZktecoMemberCard } from '../../integrations/zkteco-actions';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem' },
  error: { color: 'var(--color-error)' },
});

/** Explicit replace / clear: GET /members does not expose the current card number. */
export function AccessCard({ memberId }: { memberId: string }) {
  const t = useTranslations('admin.integrations.zkteco');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  async function save(cardNumber: string | null) {
    setSaved(false);
    setError(undefined);
    if (!setMemberAccessCardSchema.safeParse({ cardNumber }).success) {
      setError('invalidCard');
      return;
    }
    setBusy(true);
    try {
      const result = await setZktecoMemberCard(memberId, cardNumber);
      if (!result.ok) {
        setError(result.error ?? 'unreachable');
        return;
      }
      setValue('');
      setSaved(true);
    } catch {
      setError('unreachable');
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void save(value);
  }
  return (
    <Card>
      <form onSubmit={submit} {...stylex.props(styles.stack)}>
        <Label htmlFor="member-access-card">{t('cardNumber')}</Label>
        <Input
          id="member-access-card"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby="access-card-hint"
        />
        <p id="access-card-hint">{t('cardHint')}</p>
        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            {t(`errors.${t.has(`errors.${error}`) ? error : 'unexpected'}`)}
          </p>
        )}
        {saved && <p role="status">{t('cardSaved')}</p>}
        <div {...stylex.props(styles.row)}>
          <Button type="submit" variant="primary" disabled={busy || !value} label={t('saveCard')} />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            label={t('clearCard')}
            onClick={() => void save(null)}
          />
        </div>
      </form>
    </Card>
  );
}
