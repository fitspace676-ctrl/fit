'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type {
  CreatePromoCodeInput,
  PromoCodeRow,
  PromoDiscountType,
  UpdatePromoCodeInput,
} from '@fit/types';
import { Btn, Field, Icon, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { createPromoAction, updatePromoAction } from './actions';
import { majorToMinor, minorToMajor } from './marketing-meta';

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
  code: string;
  description: string;
  discountType: PromoDiscountType;
  /** Whole percent for `percentage`; a whole-lari (major-unit) amount for `fixed`. */
  discountValue: string;
  /** Optional whole-lari (major-unit) minimum purchase. */
  minPurchase: string;
  usageLimit: string;
  expiryDate: string;
  status: 'active' | 'inactive';
}

/** Seed the form from a promo row (edit) or blank (create). */
function seedState(seed: PromoCodeRow | undefined): FormState {
  return {
    code: seed?.code ?? '',
    description: seed?.description ?? '',
    discountType: seed?.discountType ?? 'percentage',
    discountValue:
      seed === undefined
        ? ''
        : seed.discountType === 'fixed'
          ? String(minorToMajor(seed.discountValue))
          : String(seed.discountValue),
    minPurchase:
      seed?.minPurchase !== undefined && seed?.minPurchase !== null
        ? String(minorToMajor(seed.minPurchase))
        : '',
    usageLimit: seed?.usageLimit != null ? String(seed.usageLimit) : '',
    expiryDate: seed?.expiryDate ? seed.expiryDate.slice(0, 10) : '',
    status: seed?.status ?? 'active',
  };
}

/** A positive integer parsed from a string, or `undefined` when blank/invalid. */
function posInt(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The Create / Edit Promo Code dialog (T12.9) — one Modal form: code, optional
 * description, discount type (percentage / fixed) + value, optional minimum
 * purchase, usage limit and expiry, and an active/inactive status. Wired to the
 * T12.7 promo-code API through the `MarketingManage` Server Actions. Fixed
 * discounts and the minimum purchase are entered in whole lari and converted to
 * MINOR units for the API.
 */
export function PromoFormDialog({
  mode,
  seed,
  onClose,
}: {
  mode: 'create' | 'edit';
  seed?: PromoCodeRow;
  onClose: () => void;
}) {
  const t = useTranslations('admin.marketing');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => seedState(seed));

  const editId = mode === 'edit' ? seed?.id : undefined;
  const isPercentage = form.discountType === 'percentage';
  const canSubmit = form.code.trim().length > 0 && posInt(form.discountValue) !== undefined;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(): void {
    if (!canSubmit || pending) return;
    setError(null);

    const rawValue = posInt(form.discountValue) ?? 0;
    // Percentage values are whole percent; fixed values are entered in whole lari.
    const discountValue = isPercentage ? rawValue : majorToMinor(rawValue);
    const minMajor = posInt(form.minPurchase);
    const minPurchase = minMajor !== undefined ? majorToMinor(minMajor) : null;
    const usageLimit = posInt(form.usageLimit) ?? null;
    const expiryDate = form.expiryDate
      ? new Date(`${form.expiryDate}T23:59:59`).toISOString()
      : null;

    const base = {
      code: form.code.trim(),
      description: form.description.trim(),
      discountType: form.discountType,
      discountValue,
      minPurchase,
      usageLimit,
      expiryDate,
      status: form.status,
    } satisfies CreatePromoCodeInput & UpdatePromoCodeInput;

    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createPromoAction(base)
          : await updatePromoAction(editId as string, base);
      if (result.ok) {
        toast(mode === 'create' ? t('promo.created') : t('promo.updated'), {
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
      title={mode === 'create' ? t('promo.addTitle') : t('promo.editTitle')}
      description={mode === 'create' ? t('promo.addDescription') : t('promo.editDescription')}
      size="lg"
      footer={
        <>
          <Btn v="outline" size="md" onClick={onClose} disabled={pending}>
            {t('wizard.cancel')}
          </Btn>
          <Btn v="primary" size="md" onClick={submit} disabled={pending || !canSubmit}>
            {pending
              ? t('wizard.saving')
              : mode === 'create'
                ? t('promo.addSubmit')
                : t('promo.editSubmit')}
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

        <Field label={t('promo.codeLabel')} hint={t('promo.codeHint')}>
          <Input
            value={form.code}
            onChange={(e) => patch('code', e.target.value.toUpperCase())}
            placeholder={t('promo.codePlaceholder')}
            autoFocus
            maxLength={64}
          />
        </Field>

        <Field label={t('promo.descriptionLabel')}>
          <Textarea
            rows={2}
            value={form.description}
            maxLength={300}
            onChange={(e) => patch('description', e.target.value)}
            placeholder={t('promo.descriptionPlaceholder')}
          />
        </Field>

        <div {...stylex.props(styles.grid)}>
          <Field label={t('promo.discountTypeLabel')}>
            <Select
              value={form.discountType}
              onChange={(e) => patch('discountType', e.target.value as PromoDiscountType)}
            >
              <option value="percentage">{t('promo.discountPercentage')}</option>
              <option value="fixed">{t('promo.discountFixed')}</option>
            </Select>
          </Field>
          <Field
            label={isPercentage ? t('promo.discountValuePercent') : t('promo.discountValueFixed')}
          >
            <Input
              type="number"
              min={1}
              max={isPercentage ? 100 : undefined}
              value={form.discountValue}
              onChange={(e) => patch('discountValue', e.target.value)}
              placeholder={
                isPercentage ? t('promo.percentPlaceholder') : t('promo.amountPlaceholder')
              }
            />
          </Field>
        </div>

        <div {...stylex.props(styles.grid)}>
          <Field label={t('promo.minPurchaseLabel')} hint={t('promo.minPurchaseHint')}>
            <Input
              type="number"
              min={0}
              value={form.minPurchase}
              onChange={(e) => patch('minPurchase', e.target.value)}
              placeholder={t('promo.amountPlaceholder')}
            />
          </Field>
          <Field label={t('promo.usageLimitLabel')} hint={t('promo.usageLimitHint')}>
            <Input
              type="number"
              min={1}
              value={form.usageLimit}
              onChange={(e) => patch('usageLimit', e.target.value)}
              placeholder={t('promo.unlimitedPlaceholder')}
            />
          </Field>
        </div>

        <div {...stylex.props(styles.grid)}>
          <Field label={t('promo.expiryLabel')} hint={t('promo.expiryHint')}>
            <Input
              type="date"
              value={form.expiryDate}
              onChange={(e) => patch('expiryDate', e.target.value)}
            />
          </Field>
          <Field label={t('promo.statusLabel')}>
            <Select
              value={form.status}
              onChange={(e) => patch('status', e.target.value as 'active' | 'inactive')}
            >
              <option value="active">{t('promo.statusActive')}</option>
              <option value="inactive">{t('promo.statusInactive')}</option>
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
