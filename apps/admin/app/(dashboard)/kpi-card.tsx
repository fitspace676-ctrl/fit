import Link from 'next/link';
import { Card, CountUp, Icon, type IconName } from '@/components/ui';

/**
 * One dashboard KPI widget, on the formacore design system: a bare accent-toned
 * icon, an animated headline `value` (the gym's active count), `total`/inactive
 * context, and the metric `label`. When `href` is set the whole card links into
 * that section.
 */
export interface KpiCardProps {
  label: string;
  value: number;
  total: number;
  href?: string;
  icon?: IconName;
  /** The icon's accent colour class (per the design: success / accent / iris). */
  tone?: string;
}

export function KpiCard({
  label,
  value,
  total,
  href,
  icon = 'chart',
  tone = 'text-brand-400',
}: KpiCardProps) {
  const inactive = total - value;
  const inner = (
    <Card glow className="flex h-full flex-col p-5 transition-colors dark:hover:bg-white/[0.06]">
      <div className="flex items-center justify-between">
        <Icon name={icon} className={`h-6 w-6 ${tone}`} />
        {href && <Icon name="arrow" className="h-4 w-4 text-ink-300 dark:text-ink-600" />}
      </div>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        <CountUp to={value} />
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
        {label}
      </p>
      <p className="mt-2 text-xs tabular-nums text-ink-500 dark:text-ink-400">
        {total.toLocaleString()} total
        {inactive > 0 ? ` · ${inactive.toLocaleString()} inactive` : ''}
      </p>
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
