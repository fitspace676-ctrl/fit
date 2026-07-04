import { useTranslations } from 'next-intl';

/** The four purchase-wizard steps, in order. Drives the progress indicator. */
export const WIZARD_STEPS = ['location', 'package', 'details', 'payment'] as const;

/** Total number of steps — the denominator in the "Step X of N" indicator. */
export const WIZARD_STEP_COUNT = WIZARD_STEPS.length;

/** A 1-based wizard step number. */
export type WizardStep = 1 | 2 | 3 | 4;

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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-ink-500 dark:text-ink-400">
          {t('progress', { current: step, total: WIZARD_STEP_COUNT })}
        </p>

        <ol className="flex items-center gap-2" aria-label={t('progressLabel')}>
          {WIZARD_STEPS.map((key, index) => {
            const position = index + 1;
            const active = position === step;
            const complete = position < step;
            return (
              <li key={key} className="flex flex-1 flex-col gap-1.5">
                <span
                  className={`h-1.5 rounded-full transition-colors ${
                    active || complete ? 'bg-brand-600' : 'bg-ink-200 dark:bg-white/10'
                  }`}
                  aria-current={active ? 'step' : undefined}
                />
                <span
                  className={`text-xs font-medium ${
                    active
                      ? 'text-brand-700 dark:text-brand-300'
                      : complete
                        ? 'text-ink-600 dark:text-ink-300'
                        : 'text-ink-400 dark:text-ink-500'
                  }`}
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
