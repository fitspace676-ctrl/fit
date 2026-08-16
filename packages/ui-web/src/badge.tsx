import type { ReactNode } from 'react';
import { Badge as AstryxBadge, type BadgeVariant } from '@astryxdesign/core/Badge';
import { Icon, type IconName } from './icon';

export type Tone =
  | 'ink'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'accent'
  | 'iris'
  | 'flame'
  | 'info'
  | 'teal';

/**
 * Formacore tone → Astryx badge variant. The Fit theme (T11.1) recolours the
 * categorical ramps to the brand, so `brand` / `accent` / `iris` (all indigo
 * family) map onto Astryx's `purple`, `flame` onto `orange`, `danger` onto the
 * semantic `error`, and `ink` onto the neutral chip.
 *
 * `info` and `teal` are the two hues that carry no status meaning — nothing in
 * the app reads a blue or teal chip as "good"/"bad" — which is what makes them
 * usable for pure categories (staff roles, T2.10) that must stay legible next
 * to a green/amber/red status pill in the same row. `info` maps onto the
 * categorical `blue` ramp (the theme repaints it to the brand info blue), not
 * onto Astryx's solid-accent `info` variant.
 */
const TONE_VARIANT: Record<Tone, BadgeVariant> = {
  ink: 'neutral',
  brand: 'purple',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  accent: 'purple',
  iris: 'purple',
  flame: 'orange',
  info: 'blue',
  teal: 'teal',
};

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
  className?: string;
}

/**
 * A status / label pill. Renders an Astryx `<Badge>` under the Fit theme,
 * keeping the formacore `tone` + `icon` prop shape so screens don't change.
 */
export function Badge({ children, tone = 'ink', icon, className = '' }: BadgeProps) {
  return (
    <AstryxBadge
      variant={TONE_VARIANT[tone]}
      label={children}
      icon={icon ? <Icon name={icon} className="h-3.5 w-3.5" sw={2.2} /> : undefined}
      className={className || undefined}
    />
  );
}
