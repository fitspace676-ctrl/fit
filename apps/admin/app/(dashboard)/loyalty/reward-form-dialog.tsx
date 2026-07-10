'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import {
  LOYALTY_REWARD_TYPE_CATALOG,
  type CreateLoyaltyRewardInput,
  type LoyaltyRewardRow,
  type LoyaltyRewardType,
  type UpdateLoyaltyRewardInput,
} from '@fit/types';
import {
  Btn,
  Field,
  Icon,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { createRewardAction, updateRewardAction } from './actions';

const styles = stylex.create({
  form: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  grid: {
    display: 'grid',
    gap: '0.875rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 480px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  activeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.75rem 0.875rem',
  },
  activeCopy: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  activeLabel: { fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' },
  activeHint: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
});

/** The dialog's string-based form state — the browser hands numbers over as strings. */
interface FormState {
  name: string;
  description: string;
  pointsCost: string;
  type: LoyaltyRewardType;
  active: boolean;
  /** Blank = unlimited stock (null); a whole number caps it. */
  stock: string;
}

/** Seed the form from a reward row (edit) or blank (create). */
function seedState(seed: LoyaltyRewardRow | undefined): FormState {
  return {
    name: seed?.name ?? '',
    description: seed?.description ?? '',
    pointsCost: seed?.pointsCost != null ? String(seed.pointsCost) : '',
    type: seed?.type ?? 'other',
    active: seed?.active ?? true,
    stock: seed?.stock != null ? String(seed.stock) : '',
  };
}

/** A positive integer parsed from a string, or `undefined` when blank/invalid. */
function posInt(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** A non-negative integer parsed from a string, or `undefined` when blank/invalid. */
function nonNegIntOrNull(value: string): number | null {
  if (value.trim() === '') {
    return null;
  }
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The Create / Edit Reward dialog (T12.11) — one Modal form: name, optional
 * description, points cost, reward type, an active toggle, and an optional stock
 * cap (blank = unlimited). Wired to the T12.10 rewards API through the
 * `LoyaltyManage` Server Actions.
 */
export function RewardFormDialog({
  mode,
  seed,
  onClose,
}: {
  mode: 'create' | 'edit';
  seed?: LoyaltyRewardRow;
  onClose: () => void;
}) {
  const t = useTranslations('admin.loyalty');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => seedState(seed));

  const editId = mode === 'edit' ? seed?.id : undefined;
  const canSubmit = form.name.trim().length > 0 && posInt(form.pointsCost) !== undefined;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(): void {
    if (!canSubmit || pending) return;
    setError(null);

    const base = {
      name: form.name.trim(),
      description: form.description.trim(),
      pointsCost: posInt(form.pointsCost) ?? 0,
      type: form.type,
      active: form.active,
      stock: nonNegIntOrNull(form.stock),
    } satisfies CreateLoyaltyRewardInput & UpdateLoyaltyRewardInput;

    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createRewardAction(base)
          : await updateRewardAction(editId as string, base);
      if (result.ok) {
        toast(mode === 'create' ? t('rewards.created') : t('rewards.updated'), {
          tone: 'success',
          icon: 'check',
        });
        onClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? t('rewards.addTitle') : t('rewards.editTitle')}
      description={mode === 'create' ? t('rewards.addDescription') : t('rewards.editDescription')}
      size="lg"
      footer={
        <>
          <Btn v="outline" size="md" onClick={onClose} disabled={pending}>
            {t('rewards.cancel')}
          </Btn>
          <Btn v="primary" size="md" onClick={submit} disabled={pending || !canSubmit}>
            {pending
              ? t('rewards.saving')
              : mode === 'create'
                ? t('rewards.addSubmit')
                : t('rewards.editSubmit')}
          </Btn>
        </>
      }
    >
      <div {...stylex.props(styles.form)}>
        {error ? (
          <div {...stylex.props(styles.errorCard)}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </div>
        ) : null}

        <Field label={t('rewards.nameLabel')}>
          <Input
            value={form.name}
            onChange={(e) => patch('name', e.target.value)}
            placeholder={t('rewards.namePlaceholder')}
            autoFocus
            maxLength={120}
          />
        </Field>

        <Field label={t('rewards.descriptionLabel')}>
          <Textarea
            rows={2}
            value={form.description}
            maxLength={500}
            onChange={(e) => patch('description', e.target.value)}
            placeholder={t('rewards.descriptionPlaceholder')}
          />
        </Field>

        <div {...stylex.props(styles.grid)}>
          <Field label={t('rewards.pointsCostLabel')} hint={t('rewards.pointsCostHint')}>
            <Input
              type="number"
              min={1}
              value={form.pointsCost}
              onChange={(e) => patch('pointsCost', e.target.value)}
              placeholder={t('rewards.pointsCostPlaceholder')}
            />
          </Field>
          <Field label={t('rewards.typeLabel')}>
            <Select
              value={form.type}
              onChange={(e) => patch('type', e.target.value as LoyaltyRewardType)}
            >
              {LOYALTY_REWARD_TYPE_CATALOG.map((meta) => (
                <option key={meta.value} value={meta.value}>
                  {t(`rewardTypes.${meta.value}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t('rewards.stockLabel')} hint={t('rewards.stockHint')}>
          <Input
            type="number"
            min={0}
            value={form.stock}
            onChange={(e) => patch('stock', e.target.value)}
            placeholder={t('rewards.stockPlaceholder')}
          />
        </Field>

        <div {...stylex.props(styles.activeRow)}>
          <div {...stylex.props(styles.activeCopy)}>
            <span {...stylex.props(styles.activeLabel)}>{t('rewards.activeLabel')}</span>
            <span {...stylex.props(styles.activeHint)}>{t('rewards.activeHint')}</span>
          </div>
          <Switch
            checked={form.active}
            onChange={(next) => patch('active', next)}
            label={t('rewards.activeLabel')}
          />
        </div>
      </div>
    </Modal>
  );
}
