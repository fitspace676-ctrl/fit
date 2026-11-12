import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@fit/ui-kit';

export { OpsLogo, OpsMark } from './logo';
export { SurfaceButton, FilterPills, OpsTable } from './controls';
export { SearchField } from './search-field';
// Card already has the design's white surface, 26px radius, and no elevation.
export { Card as OpsCard } from '@fit/ui-kit';

export function PageHead({
  title,
  description,
  subtitle,
  eyebrow,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="ops-page-head">
      <div className="ops-page-heading">
        {eyebrow}
        <h1>{title}</h1>
        {(description ?? subtitle) ? <p>{description ?? subtitle}</p> : null}
      </div>
      {(actions ?? children) ? <div className="ops-page-actions">{actions ?? children}</div> : null}
    </header>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="ops-back" href={href}>
      <span aria-hidden="true">‹</span>
      {label}
    </Link>
  );
}

export function Cap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`ops-cap ${className}`}>{children}</span>;
}

export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`ops-mono ${className}`}>{children}</span>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="ops-section-title">
      <h2>{children}</h2>
      {aside}
    </div>
  );
}

export function Fact({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="ops-fact">
      <Cap>{label}</Cap>
      <span className={numeric ? 'ops-fact-number' : 'ops-fact-value'}>{value}</span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <Card>
      <div className="ops-stat">
        <Cap>{label}</Cap>
        <span className="ops-stat-value">{value}</span>
        {sub ? <p>{sub}</p> : null}
      </div>
    </Card>
  );
}
