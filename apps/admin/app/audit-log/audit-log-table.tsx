'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AuditLogRow } from '@fit/types';
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
    return <span className="text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-col">
      <span className="font-medium text-slate-900">{name ?? email}</span>
      {name && email ? <span className="text-xs text-slate-500">{email}</span> : null}
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
    return <span className="text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span key={key} className="rounded-card bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          <span className="font-medium text-slate-500">{key}:</span> {formatMetadataValue(value)}
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
      <p className="rounded-card border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        No audit entries match your filters yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">Action</th>
              <th className="py-2 pr-4 font-medium">Actor</th>
              <th className="py-2 pr-4 font-medium">Target</th>
              <th className="py-2 pr-4 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-slate-100 align-top hover:bg-slate-50/60"
              >
                <td className="whitespace-nowrap py-2 pr-4 text-slate-700 tabular-nums">
                  {formatTimestamp(entry.createdAt)}
                </td>
                <td className="py-2 pr-4">
                  <span className="rounded-card bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {auditActionLabel(entry.action)}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <ActorCell name={entry.actorName} email={entry.actorEmail} />
                </td>
                <td className="py-2 pr-4">
                  <ActorCell name={entry.targetName} email={entry.targetEmail} />
                </td>
                <td className="py-2 pr-4">
                  <MetadataCell metadata={entry.metadata} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span className="tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => startTransition(() => router.replace(pageHref(page - 1)))}
            className="rounded-card border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => startTransition(() => router.replace(pageHref(page + 1)))}
            className="rounded-card border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
