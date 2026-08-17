import Link from 'next/link';
import { Card, CountUp } from '@fit/ui-kit';
import { Icon, type IconName } from '@/components/ui';
import { createNumberFormat, defaultLocale } from '@fit/i18n';

/**
 * One dashboard KPI widget, on the formacore design system: an icon, an animated
 * headline `value` (the gym's active count), `total`/inactive context, and the
 * metric `label`. When `href` is set the whole card links into that section.
 */
export interface KpiCardProps {
  label: string;
  value: number;
  total: number;
  href?: string;
  icon?: IconName;
}

export function KpiCard({ label, value, total, href, icon = 'chart' }: KpiCardProps) {
  const inactive = total - value;
  const inner = (
    <Card>
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        {href && <Icon name="arrow" className="h-4 w-4 text-ink-300 dark:text-ink-600" />}
      </div>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        <CountUp to={value} />
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </p>
      <p className="mt-2 text-xs tabular-nums text-ink-500 dark:text-ink-400">
        {createNumberFormat(defaultLocale).format(total)} total
        {inactive > 0 ? ` · ${createNumberFormat(defaultLocale).format(inactive)} inactive` : ''}
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
