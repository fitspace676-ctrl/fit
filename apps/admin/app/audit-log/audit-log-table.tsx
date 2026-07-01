'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AuditLogRow } from '@fit/types';
import { Badge, Btn, Card } from '@/components/ui';
import { auditActionLabel } from './audit-actions';

/** Render an ISO instant as a short local date + time, or an em dash when absent. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
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
    return <span className="text-ink-400">—</span>;
  }
  return (
    <div className="flex flex-col">
      <span className="font-medium text-ink-900 dark:text-white">{name ?? email}</span>
      {name && email ? (
        <span className="text-xs text-ink-500 dark:text-ink-400">{email}</span>
      ) : null}
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
    return <span className="text-ink-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="rounded-pill bg-ink-100 px-2 py-0.5 text-xs text-ink-600 dark:bg-white/10 dark:text-ink-300"
        >
          <span className="font-medium text-ink-500 dark:text-ink-400">{key}:</span>{' '}
          {formatMetadataValue(value)}
        </span>
      ))}
    </div>
  );
}

/**
 * The audit-log viewer table (T4.9). Server-rendered, read-only data with a
 * client-side pager that reads/writes the URL search params so the server page
 * stays the single source of truth. Nothing here mutates — the audit trail is
 * append-only and viewed, never edited.
 */
export function AuditLogTable({
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

  /** Build a URL with the page param overridden. */
  function pageHref(nextPage: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(nextPage));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (entries.length === 0) {
    return (
      <Card className="px-4 py-8 text-center text-sm text-ink-500 dark:text-ink-400">
        No audit entries match your filters yet.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 dark:border-white/10">
              <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                When
              </th>
              <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                Action
              </th>
              <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                Actor
              </th>
              <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                Target
              </th>
              <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-ink-50 align-top last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                  {formatTimestamp(entry.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone="brand">{auditActionLabel(entry.action)}</Badge>
                </td>
                <td className="px-4 py-3">
                  <ActorCell name={entry.actorName} email={entry.actorEmail} />
                </td>
                <td className="px-4 py-3">
                  <ActorCell name={entry.targetName} email={entry.targetEmail} />
                </td>
                <td className="px-4 py-3">
                  <MetadataCell metadata={entry.metadata} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <Btn
            v="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => startTransition(() => router.replace(pageHref(page - 1)))}
          >
            Previous
          </Btn>
          <Btn
            v="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => startTransition(() => router.replace(pageHref(page + 1)))}
          >
            Next
          </Btn>
        </div>
      </div>
    </div>
  );
}
