import Link from 'next/link';

/**
 * One dashboard KPI widget (T4.10). Leads with a single headline `value` (the
 * gym's active count), with `total` shown beneath as context and `label` naming
 * the metric. When `href` is set the whole card is a link into that section; the
 * card is a server component — no client JS, it renders inside the dashboard's
 * server-rendered grid.
 */
export interface KpiCardProps {
  /** Metric name, e.g. "Active members". */
  label: string;
  /** Headline figure — the active count. */
  value: number;
  /** All-statuses count shown as the sub-label context. */
  total: number;
  /** Optional section to link the card to (e.g. `/members`). */
  href?: string;
}

export function KpiCard({ label, value, total, href }: KpiCardProps) {
  const inactive = total - value;
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-sm text-slate-500 tabular-nums">
        {total.toLocaleString()} total
        {inactive > 0 ? ` · ${inactive.toLocaleString()} inactive` : ''}
      </p>
    </>
  );

  const className = 'flex flex-col rounded-card border border-slate-200 bg-white p-5 transition';

  if (href) {
    return (
      <Link href={href} className={`${className} hover:border-brand-300 hover:shadow-sm`}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
