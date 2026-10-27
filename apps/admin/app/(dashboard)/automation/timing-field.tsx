'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { AUTOMATION_TIMING_PRESETS, parseTimingOffset, formatTimingOffset } from '@fit/types';
import { Field, FieldGroup, SelectField } from '@fit/ui-kit';

export interface TimingState {
  timingAmount: string;
  timingUnit: 'd' | 'h';
  timingDirection: 'before' | 'after' | 'now';
}

export function timingState(offset: string, event: boolean): TimingState {
  const { amount, unit } = parseTimingOffset(offset);
  return {
    timingAmount: String(Math.abs(amount)),
    timingUnit: unit,
    timingDirection:
      amount === 0 || (event && amount < 0) ? 'now' : amount < 0 ? 'before' : 'after',
  };
}

export function validTiming(value: TimingState): boolean {
  if (value.timingDirection === 'now') return true;
  return (
    /^\d+$/.test(value.timingAmount) &&
    Number(value.timingAmount) <= (value.timingUnit === 'd' ? 365 : 8760)
  );
}

export function timingOffset(value: TimingState): string {
  return value.timingDirection === 'now'
    ? '0d'
    : formatTimingOffset(
        Number(value.timingAmount) * (value.timingDirection === 'before' ? -1 : 1),
        value.timingUnit,
      );
}

export function timingLabel(
  offset: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const { amount, unit } = parseTimingOffset(offset);
  return amount === 0
    ? t('timing.now')
    : t(amount < 0 ? 'timing.before' : 'timing.after', {
        count: Math.abs(amount),
        unit: t(unit === 'd' ? 'timing.days' : 'timing.hours'),
      });
}

const styles = stylex.create({
  fields: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  row: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' },
});

export function TimingField({
  value,
  event,
  onChange,
}: {
  value: TimingState;
  event: boolean;
  onChange: (value: TimingState) => void;
}) {
  const t = useTranslations('admin.automation');
  const offset = validTiming(value) ? timingOffset(value) : '';
  return (
    <FieldGroup label={t('form.timing')}>
      <div {...stylex.props(styles.fields)}>
        <SelectField
          label={t('timing.preset')}
          value={AUTOMATION_TIMING_PRESETS.some((p) => p.value === offset) ? offset : ''}
          hint={event ? t('timing.eventHint') : t('form.timingHint')}
          onChange={(e) => onChange(timingState(e.target.value, event))}
          options={[
            { value: '', label: t('timing.custom'), disabled: true },
            ...AUTOMATION_TIMING_PRESETS.filter((p) => !event || p.days >= 0).map((p) => ({
              value: p.value,
              label: timingLabel(p.value, t),
            })),
          ]}
        />
        <SelectField
          label={t('timing.direction')}
          value={value.timingDirection}
          onChange={(e) =>
            onChange({
              ...value,
              timingDirection: e.target.value as TimingState['timingDirection'],
            })
          }
          options={['now', ...(!event ? ['before'] : []), 'after'].map((direction) => ({
            value: direction,
            label: t(`timing.direction_${direction}`),
          }))}
        />
        {value.timingDirection !== 'now' && (
          <div {...stylex.props(styles.row)}>
            <Field
              label={t('timing.amount')}
              type="number"
              min={0}
              max={value.timingUnit === 'd' ? 365 : 8760}
              step={1}
              value={value.timingAmount}
              invalid={!validTiming(value)}
              hint={!validTiming(value) ? t('timing.invalid') : undefined}
              onChange={(e) => onChange({ ...value, timingAmount: e.target.value })}
            />
            <SelectField
              label={t('timing.unit')}
              value={value.timingUnit}
              onChange={(e) => onChange({ ...value, timingUnit: e.target.value as 'd' | 'h' })}
              options={[
                { value: 'd', label: t('timing.days') },
                { value: 'h', label: t('timing.hours') },
              ]}
            />
          </div>
        )}
      </div>
    </FieldGroup>
  );
}
