'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { LoyaltyProgramResponse, UpdateLoyaltyProgramInput } from '@fit/types';
import { Btn, Field, Icon, Input, Switch, useToast } from '@/components/ui';
import { updateProgramAction } from './actions';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-surface)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
  },
  panelHead: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  panelTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  panelHint: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  enableRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.875rem 1rem',
  },
  enableCopy: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  enableLabel: { fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' },
  enableHint: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  grid: {
    display: 'grid',
    gap: '0.875rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  savedNote: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  savedIcon: { width: '0.875rem', height: '0.875rem' },
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
  readNote: { margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
});

/** The panel's string-based form state — the browser hands numbers over as strings. */
interface FormState {
  enabled: boolean;
  pointsPerCheckIn: string;
  pointsPerCurrencyUnit: string;
  signupBonus: string;
}

/** Seed the form from the saved program config. */
function seedState(program: LoyaltyProgramResponse): FormState {
  return {
    enabled: program.enabled,
    pointsPerCheckIn: String(program.pointsPerCheckIn),
    pointsPerCurrencyUnit: String(program.pointsPerCurrencyUnit),
    signupBonus: String(program.signupBonus),
  };
}

/** A non-negative integer parsed from a string; `0` when blank/invalid. */
function nonNegInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * The Program tab (T12.11): the gym's loyalty program configuration — an
 * enable/disable toggle plus the three earn rules (points per check-in, points
 * per currency unit spent, sign-up bonus). Behind `LoyaltyManage` the form is
 * editable and saves through the Server Action; read-only staff see the current
 * config with the controls disabled. The server page stays the source of truth
 * and re-renders on refresh.
 */
export function ProgramView({
  program,
  canManage,
}: {
  program: LoyaltyProgramResponse;
  canManage: boolean;
}) {
  const t = useTranslations('admin.loyalty');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => seedState(program));

  const baseline = useMemo(() => seedState(program), [program]);
  const dirty =
    form.enabled !== baseline.enabled ||
    nonNegInt(form.pointsPerCheckIn) !== nonNegInt(baseline.pointsPerCheckIn) ||
    nonNegInt(form.pointsPerCurrencyUnit) !== nonNegInt(baseline.pointsPerCurrencyUnit) ||
    nonNegInt(form.signupBonus) !== nonNegInt(baseline.signupBonus);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(): void {
    if (!canManage || pending || !dirty) return;
    setError(null);

    const input: UpdateLoyaltyProgramInput = {
      enabled: form.enabled,
      pointsPerCheckIn: nonNegInt(form.pointsPerCheckIn),
      pointsPerCurrencyUnit: nonNegInt(form.pointsPerCurrencyUnit),
      signupBonus: nonNegInt(form.signupBonus),
    };

    startTransition(async () => {
      const result = await updateProgramAction(input);
      if (result.ok) {
        setForm(seedState(result.data));
        toast(t('program.saved'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div {...stylex.props(styles.stack)}>
      <section {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.panelHead)}>
          <h2 {...stylex.props(styles.panelTitle)}>{t('program.heading')}</h2>
          <p {...stylex.props(styles.panelHint)}>{t('program.subheading')}</p>
        </div>

        {error ? (
          <div {...stylex.props(styles.errorCard)}>
            <Icon name="info" {...stylex.props(styles.errorIcon)} />
            <p role="alert" {...stylex.props(styles.errorText)}>
              {error}
            </p>
          </div>
        ) : null}

        <div {...stylex.props(styles.enableRow)}>
          <div {...stylex.props(styles.enableCopy)}>
            <span {...stylex.props(styles.enableLabel)}>{t('program.enableLabel')}</span>
            <span {...stylex.props(styles.enableHint)}>{t('program.enableHint')}</span>
          </div>
          <Switch
            checked={form.enabled}
            onChange={(next) => (canManage ? patch('enabled', next) : undefined)}
            label={t('program.enableLabel')}
          />
        </div>

        <div {...stylex.props(styles.grid)}>
          <Field
            label={t('program.pointsPerCheckInLabel')}
            hint={t('program.pointsPerCheckInHint')}
          >
            <Input
              type="number"
              min={0}
              value={form.pointsPerCheckIn}
              disabled={!canManage}
              onChange={(e) => patch('pointsPerCheckIn', e.target.value)}
            />
          </Field>
          <Field
            label={t('program.pointsPerCurrencyLabel')}
            hint={t('program.pointsPerCurrencyHint')}
          >
            <Input
              type="number"
              min={0}
              value={form.pointsPerCurrencyUnit}
              disabled={!canManage}
              onChange={(e) => patch('pointsPerCurrencyUnit', e.target.value)}
            />
          </Field>
          <Field label={t('program.signupBonusLabel')} hint={t('program.signupBonusHint')}>
            <Input
              type="number"
              min={0}
              value={form.signupBonus}
              disabled={!canManage}
              onChange={(e) => patch('signupBonus', e.target.value)}
            />
          </Field>
        </div>

        {canManage ? (
          <div {...stylex.props(styles.footer)}>
            <span {...stylex.props(styles.savedNote)}>
              <Icon name="clock" {...stylex.props(styles.savedIcon)} />
              {program.updatedAt ? t('program.lastSaved') : t('program.neverSaved')}
            </span>
            <Btn v="primary" size="md" onClick={submit} disabled={pending || !dirty}>
              {pending ? t('program.saving') : t('program.save')}
            </Btn>
          </div>
        ) : (
          <p {...stylex.props(styles.readNote)}>{t('program.readOnly')}</p>
        )}
      </section>
    </div>
  );
}
