'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';

/** A trainer the PT-calendar selector offers. */
export interface TrainerOption {
  id: string;
  name: string;
}

const styles = stylex.create({
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.375rem', maxWidth: '20rem' },
  label: { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' },
  select: {
    height: '2.75rem',
    width: '100%',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outlineStyle: 'none',
  },
});

/**
 * The PT calendar's trainer picker. The chosen trainer is the single axis the
 * calendar is scoped to, so it lives in the URL (`?trainerId=`) as the server
 * page's source of truth; changing it re-fetches that trainer's sessions. The
 * visible week is preserved across a trainer change.
 */
export function TrainerSelect({
  trainers,
  trainerId,
}: {
  trainers: TrainerOption[];
  trainerId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(nextId: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) {
      params.set('trainerId', nextId);
    } else {
      params.delete('trainerId');
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <label htmlFor="pt-trainer" {...stylex.props(styles.label)}>
        Trainer
      </label>
      <select
        id="pt-trainer"
        value={trainerId}
        onChange={(event) => onChange(event.target.value)}
        {...stylex.props(styles.select)}
      >
        <option value="">{trainers.length === 0 ? 'No trainers yet' : 'Select a trainer…'}</option>
        {trainers.map((trainer) => (
          <option key={trainer.id} value={trainer.id}>
            {trainer.name}
          </option>
        ))}
      </select>
    </div>
  );
}
