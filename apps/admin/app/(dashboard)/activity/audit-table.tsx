'use client';

// @fit/admin — the Activity area's audit tab table (T3.10, was T4.9).
//
// The gym's trail of privileged actions (owner impersonation, gym status
// changes), rendered as the formacore Card table that matches the console's other
// data tables. Server-rendered, read-only data with a client-side pager that
// reads/writes the URL search params — so the server page stays the single source
// of truth and the `?tab=audit` param round-trips untouched. Nothing here mutates:
// the audit trail is append-only, viewed and never edited.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { AuditLogRow } from '@fit/types';
import { Badge, Btn } from '@/components/ui';
import { auditActionLabelKey } from './audit-actions';

/** Translator for the `admin.activity.audit` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

const styles = stylex.create({
  muted: {
    color: 'var(--color-text-secondary)',
  },
  actorCell: {
    display: 'flex',
    flexDirection: 'column',
  },
  actorName: {
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  actorEmail: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  metaWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
  },
  metaChip: {
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  metaKey: {
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  emptyCard: {
    paddingInline: '1rem',
    paddingBlock: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  tableCard: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '0.875rem',
  },
  headRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  head: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  bodyRow: {
    verticalAlign: 'top',
    borderBottomWidth: {
      default: '1px',
      ':last-child': 0,
    },
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  cell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
  },
  whenCell: {
    whiteSpace: 'nowrap',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  pagerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pagerCount: {
    fontVariantNumeric: 'tabular-nums',
  },
  pagerBtns: {
    display: 'flex',
    gap: '0.5rem',
  },
});

/** Render an ISO instant as a short local date + time, or an em dash when absent. */
function formatTimestamp(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** A user's display name + email as a stacked cell, or an em dash when there is none. */
function ActorCell({ name, email }: { name: string | null; email: string | null }) {
  if (!name && !email) {
    return <span {...stylex.props(styles.muted)}>—</span>;
  }
  return (
    <div {...stylex.props(styles.actorCell)}>
      <span {...stylex.props(styles.actorName)}>{name ?? email}</span>
      {name && email ? <span {...stylex.props(styles.actorEmail)}>{email}</span> : null}
    </div>
  );
}

/** Render one metadata value as a short string — primitives as-is, objects as JSON. */
function formatMetadataValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return JSON.stringify(value) ?? '';
  }
}

/** Render the action's JSON metadata as compact `key: value` chips. */
function MetadataCell({ metadata }: { metadata: Record<string, unknown> | null }) {
  const entries = metadata ? Object.entries(metadata) : [];
  if (entries.length === 0) {
    return <span {...stylex.props(styles.muted)}>—</span>;
  }
  return (
    <div {...stylex.props(styles.metaWrap)}>
      {entries.map(([key, value]) => (
        <span key={key} {...stylex.props(styles.metaChip)}>
          <span {...stylex.props(styles.metaKey)}>{key}:</span> {formatMetadataValue(value)}
        </span>
      ))}
    </div>
  );
}

/** The action badge, resolving the known-action label via i18n (raw key otherwise). */
function ActionBadge({ action, t }: { action: string; t: T }) {
  const key = auditActionLabelKey(action);
  return <Badge tone="brand">{key ? t(`actions.${key}`) : action}</Badge>;
}

export function AuditTable({
  entries,
  total,
  page,
  limit,
}: {
  entries: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const t = useTranslations('admin.activity.audit');
  const locale = useLocale();

  /** Build a URL with the page param overridden (every other param preserved). */
  function pageHref(nextPage: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(nextPage));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  if (entries.length === 0) {
    return (
      <Card variant="default" padding={0} xstyle={styles.emptyCard}>
        {t('empty')}
      </Card>
    );
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  return (
    <div {...stylex.props(styles.stack)}>
      <Card variant="default" padding={0} xstyle={styles.tableCard}>
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr {...stylex.props(styles.headRow)}>
              <th {...stylex.props(styles.head)}>{t('columns.when')}</th>
              <th {...stylex.props(styles.head)}>{t('columns.action')}</th>
              <th {...stylex.props(styles.head)}>{t('columns.actor')}</th>
              <th {...stylex.props(styles.head)}>{t('columns.target')}</th>
              <th {...stylex.props(styles.head)}>{t('columns.details')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} {...stylex.props(styles.bodyRow)}>
                <td {...stylex.props(styles.whenCell)}>
                  {formatTimestamp(entry.createdAt, locale)}
                </td>
                <td {...stylex.props(styles.cell)}>
                  <ActionBadge action={entry.action} t={t} />
                </td>
                <td {...stylex.props(styles.cell)}>
                  <ActorCell name={entry.actorName} email={entry.actorEmail} />
                </td>
                <td {...stylex.props(styles.cell)}>
                  <ActorCell name={entry.targetName} email={entry.targetEmail} />
                </td>
                <td {...stylex.props(styles.cell)}>
                  <MetadataCell metadata={entry.metadata} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Pager. */}
      <div {...stylex.props(styles.pagerRow)}>
        <span {...stylex.props(styles.pagerCount)}>{t('pager.range', { from, to, total })}</span>
        <div {...stylex.props(styles.pagerBtns)}>
          <Btn
            v="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => startTransition(() => router.replace(pageHref(page - 1)))}
          >
            {t('pager.previous')}
          </Btn>
          <Btn
            v="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => startTransition(() => router.replace(pageHref(page + 1)))}
          >
            {t('pager.next')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
