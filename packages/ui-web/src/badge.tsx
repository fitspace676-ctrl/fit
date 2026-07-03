import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';

export type Tone = 'ink' | 'brand' | 'success' | 'warning' | 'danger' | 'accent' | 'iris' | 'flame';

/** Per-tone light + dark classes (text + gradient fill + ring). */
const TONES: Record<Tone, string> = {
  ink: 'text-ink-700 from-ink-300/55 to-ink-400/20 ring-ink-300/70 dark:text-ink-100 dark:from-white/[0.12] dark:to-white/[0.04] dark:ring-white/15',
  brand:
    'text-brand-700 from-brand-400/30 to-brand-600/10 ring-brand-500/30 dark:text-brand-100 dark:from-brand-400/35 dark:to-brand-600/15 dark:ring-brand-400/30',
  success:
    'text-success-700 from-success-400/30 to-success-600/10 ring-success-500/30 dark:text-success-100 dark:from-success-400/35 dark:to-success-600/15 dark:ring-success-400/30',
  warning:
    'text-warning-800 from-warning-400/35 to-warning-600/12 ring-warning-500/35 dark:text-warning-100 dark:from-warning-400/35 dark:to-warning-600/15 dark:ring-warning-400/30',
  danger:
    'text-danger-700 from-danger-400/30 to-danger-600/10 ring-danger-500/30 dark:text-danger-100 dark:from-danger-400/35 dark:to-danger-600/15 dark:ring-danger-400/30',
  accent:
    'text-accent-700 from-accent-400/30 to-accent-600/10 ring-accent-500/30 dark:text-accent-100 dark:from-accent-400/35 dark:to-accent-600/15 dark:ring-accent-400/30',
  iris: 'text-iris-700 from-iris-400/30 to-iris-600/10 ring-iris-500/30 dark:text-iris-100 dark:from-iris-400/35 dark:to-iris-600/15 dark:ring-iris-400/30',
  flame:
    'text-flame-700 from-flame-400/30 to-flame-600/10 ring-flame-500/30 dark:text-flame-100 dark:from-flame-400/35 dark:to-flame-600/15 dark:ring-flame-400/30',
};

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
  className?: string;
}

/** A glassy gradient pill used for status and labels across the portal. */
export function Badge({ children, tone = 'ink', icon, className = '' }: BadgeProps) {
  return (
    <span
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-pill bg-gradient-to-b px-2.5 py-1 text-xs font-semibold ring-1 ring-inset backdrop-blur-md ${TONES[tone]} ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent dark:from-white/20"
      />
      {icon && <Icon name={icon} className="relative h-3.5 w-3.5" sw={2.2} />}
      <span className="relative">{children}</span>
    </span>
  );
}
