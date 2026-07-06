import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';

/** The four purchase-wizard steps, in order. Drives the progress indicator. */
export const WIZARD_STEPS = ['location', 'package', 'details', 'payment'] as const;

/** Total number of steps — the denominator in the "Step X of N" indicator. */
export const WIZARD_STEP_COUNT = WIZARD_STEPS.length;

/** A 1-based wizard step number. */
export type WizardStep = 1 | 2 | 3 | 4;

// Astryx migration (T11.15): the "Step X of N" progress indicator is authored in
// compiled StyleX over the Fit brand theme tokens (`var(--color-accent)` for the
// active/complete bars) — no Tailwind utilities. Free of client state so the
// page can render it server-side; step logic is unchanged.
const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  head: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  progressText: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  steps: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  step: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: '0.375rem',
  },
  bar: {
    height: '0.375rem',
    borderRadius: 'var(--radius-full)',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  barDone: {
    backgroundColor: 'var(--color-accent)',
  },
  barTodo: {
    backgroundColor: 'var(--color-background-muted)',
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  labelActive: {
    color: 'var(--color-text-accent)',
  },
  labelDone: {
    color: 'var(--color-text-secondary)',
  },
  labelTodo: {
    color: 'var(--color-text-disabled)',
  },
});

export interface WizardShellProps {
  /** The active step (1-based). Earlier steps render as complete, later as upcoming. */
  step: WizardStep;
  children: React.ReactNode;
}

/**
 * Presentational chrome for the purchase wizard: a "Step X of 4" progress
 * indicator above the active step's content. Free of client state and hooks
 * (it only reads the message catalogue via next-intl, which works in Server
 * Components), so the page can render it server-side and hand the interactive
 * work to the step component it wraps.
 */
export function WizardShell({ step, children }: WizardShellProps) {
  const t = useTranslations('checkout');

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.head)}>
        <p {...stylex.props(styles.progressText)}>
          {t('progress', { current: step, total: WIZARD_STEP_COUNT })}
        </p>

        <ol {...stylex.props(styles.steps)} aria-label={t('progressLabel')}>
          {WIZARD_STEPS.map((key, index) => {
            const position = index + 1;
            const active = position === step;
            const complete = position < step;
            return (
              <li key={key} {...stylex.props(styles.step)}>
                <span
                  {...stylex.props(
                    styles.bar,
                    active || complete ? styles.barDone : styles.barTodo,
                  )}
                  aria-current={active ? 'step' : undefined}
                />
                <span
                  {...stylex.props(
                    styles.label,
                    active ? styles.labelActive : complete ? styles.labelDone : styles.labelTodo,
                  )}
                >
                  {t(`steps.${key}`)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {children}
    </div>
  );
}
