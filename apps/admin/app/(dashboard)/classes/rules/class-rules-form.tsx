'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { z } from 'zod';
import { MAX_CANCELLATION_CUTOFF_HOURS, type ClassRules } from '@fit/types';
import { Button, Card } from '@fit/ui-kit';
import { Form, useToast, useWatch, useZodForm } from '@/components/ui';
import { NumberField } from '@/components/ui/form-fields';
import { updateClassRulesAction } from './actions';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  field: { position: 'relative', paddingInlineEnd: '5rem' },
  unit: {
    position: 'absolute',
    insetInlineEnd: 0,
    top: '2rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  note: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  actions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
});
function toValues(rules: ClassRules) {
  return {
    booking: { cancellationCutoffHours: rules.booking.cancellationCutoffHours },
    noShow: {
      strikeLimit: rules.noShow.strikeLimit,
      strikeWindowDays: rules.noShow.strikeWindowDays,
      blockDays: rules.noShow.blockDays,
    },
  };
}

export function ClassRulesForm({ initial }: { initial: ClassRules }) {
  const t = useTranslations('admin.classRules');
  const settingsT = useTranslations('admin.settings');
  const router = useRouter();
  const { toast } = useToast();
  const schema = useMemo(() => {
    const num = (max: number) =>
      z
        .number({ invalid_type_error: settingsT('errors.number') })
        .int(settingsT('errors.integer'))
        .min(0, settingsT('errors.min', { min: 0 }))
        .max(max, settingsT('errors.max', { max }));
    return z.object({
      booking: z.object({ cancellationCutoffHours: num(MAX_CANCELLATION_CUTOFF_HOURS) }),
      noShow: z
        .object({ strikeLimit: num(50), strikeWindowDays: num(365), blockDays: num(365) })
        .superRefine((value, ctx) => {
          const keys = ['strikeLimit', 'strikeWindowDays', 'blockDays'] as const;
          if (keys.some((key) => value[key] > 0)) {
            for (const key of keys)
              if (value[key] === 0)
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: [key],
                  message: t('requiredTogether'),
                });
          }
        }),
    });
  }, [t, settingsT]);
  const form = useZodForm(schema, { defaultValues: toValues(initial) });
  const rule = useWatch({ control: form.control, name: 'noShow' });
  const count = Number.isFinite(rule.strikeLimit) ? rule.strikeLimit : 0;
  const windowDays = Number.isFinite(rule.strikeWindowDays) ? rule.strikeWindowDays : 0;
  const blockDays = Number.isFinite(rule.blockDays) ? rule.blockDays : 0;
  const fields = [
    {
      name: 'booking.cancellationCutoffHours',
      key: 'cutoff',
      max: MAX_CANCELLATION_CUTOFF_HOURS,
      unit: 'hours',
    },
    { name: 'noShow.strikeLimit', key: 'limit', max: 50, unit: 'noShows' },
    { name: 'noShow.strikeWindowDays', key: 'window', max: 365, unit: 'days' },
    { name: 'noShow.blockDays', key: 'duration', max: 365, unit: 'days' },
  ] as const;
  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        const result = await updateClassRulesAction(values);
        if (result.ok) {
          form.reset(toValues(result.data));
          toast(settingsT('toast.saved'), { tone: 'success', icon: 'check' });
          router.refresh();
        } else
          toast(result.error || settingsT('toast.saveFailed'), { tone: 'danger', icon: 'info' });
      }}
    >
      <Card xstyle={styles.stack}>
        {fields.map((field) => (
          <div key={field.name} {...stylex.props(styles.field)}>
            <NumberField
              name={field.name}
              label={t(`${field.key}Label`)}
              aria-label={`${t(`${field.key}Label`)} (${t(field.unit)})`}
              hint={t(`${field.key}Hint`)}
              min={0}
              max={field.max}
              step={1}
            />
            <span aria-hidden {...stylex.props(styles.unit)}>
              {t(field.unit)}
            </span>
          </div>
        ))}
        <p {...stylex.props(styles.note)}>{t('summary', { count, windowDays, blockDays })}</p>
        {count <= 0 || windowDays <= 0 || blockDays <= 0 ? (
          <p {...stylex.props(styles.note)}>{t('off')}</p>
        ) : null}
        <p {...stylex.props(styles.note)}>{t('attendanceNote')}</p>
        <div {...stylex.props(styles.actions)}>
          <Button
            type="button"
            variant="secondary"
            label={settingsT('saveBar.discard')}
            disabled={form.formState.isSubmitting}
            onClick={() => form.reset()}
          />
          <Button
            type="submit"
            variant="primary"
            label={settingsT(form.formState.isSubmitting ? 'saveBar.saving' : 'saveBar.save')}
            disabled={form.formState.isSubmitting}
          />
        </div>
      </Card>
    </Form>
  );
}
