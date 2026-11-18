'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@fit/ui-kit';
import { updateGymSettingsAction } from '../../settings/actions';

const styles = stylex.create({
  form: { display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '36rem' },
  label: { fontWeight: 600, color: 'var(--color-text-primary)' },
  hint: { margin: 0, color: 'var(--color-text-secondary)', lineHeight: 1.5 },
  input: {
    width: '8rem',
    padding: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    fontSize: '1rem',
  },
});

export function ShopSettingsForm({ initialPercent }: { initialPercent: number }) {
  const t = useTranslations('shopDiscount');
  const [percent, setPercent] = useState(String(initialPercent));
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <form
      {...stylex.props(styles.form)}
      onSubmit={(event) => {
        event.preventDefault();
        const value = Number(percent);
        if (percent.trim() === '' || !Number.isInteger(value) || value < 0 || value > 90) {
          setMessage(t('invalid'));
          return;
        }
        startTransition(async () => {
          const result = await updateGymSettingsAction({ shop: { memberDiscountPercent: value } });
          setMessage(result.ok ? t('saved') : t('error'));
        });
      }}
    >
      <label {...stylex.props(styles.label)} htmlFor="member-shop-discount">
        {t('label')}
      </label>
      <input
        {...stylex.props(styles.input)}
        id="member-shop-discount"
        type="number"
        min={0}
        max={90}
        step={1}
        required
        value={percent}
        onChange={(event) => setPercent(event.target.value)}
        aria-describedby="member-shop-discount-hint"
        disabled={pending}
      />
      <p {...stylex.props(styles.hint)} id="member-shop-discount-hint">
        {t('hint')}
      </p>
      <Button
        type="submit"
        variant="primary"
        loading={pending}
        disabled={pending}
        label={t('save')}
      />
      <p role="status">{message}</p>
    </form>
  );
}
