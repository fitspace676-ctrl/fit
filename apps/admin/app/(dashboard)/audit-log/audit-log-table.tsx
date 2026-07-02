'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AuditLogRow } from '@fit/types';
import { Btn, Card, Icon } from '@/components/ui';
import { auditActionDot, auditActionLabel } from './audit-actions';

/**
 * Render an ISO instant the way the reference table does — "Today · 09:12",
 * "Yesterday · 18:22", then "1 Jun · 09:00" (with the year once it differs) —
 * in the staff member's local zone. An unparsable value renders an em dash.
 */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (dayDiff === 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Yesterday · ${time}`;
  const day = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
  return `${day} · ${time}`;
}

/** A user's initials for the avatar placeholder (no photo on the wire). */
function initialsOf(name: string | null, email: string | null): string {
  const source = name ?? email ?? '';
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** The STAFF cell — initials avatar + display name over email, per the reference. */
function ActorCell({ name, email }: { name: string | null; email: string | null }) {
  if (!name && !email) {
    return <span className="text-ink-400 dark:text-ink-500">—</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-500/15 dark:text-brand-200">
        {initialsOf(name, email)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink-900 dark:text-white">{name ?? email}</p>
        {name && email ? (
          <p className="truncate text-xs text-ink-400 dark:text-ink-500">{email}</p>
        ) : null}
      </div>
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

/** The action's JSON metadata as one compact mono `key: value · …` line. */
function MetadataCell({ metadata }: { metadata: Record<string, unknown> | null }) {
  const entries = metadata ? Object.entries(metadata) : [];
  if (entries.length === 0) {
    return <span className="text-ink-400 dark:text-ink-500">—</span>;
  }
  const text = entries.map(([key, value]) => `${key}: ${formatMetadataValue(value)}`).join(' · ');
  return (
    <span className="block max-w-56 truncate" title={text}>
      {text}
    </span>
  );
}

/**
 * The audit-log viewer table (T4.9), reskinned to the Planflow "formacore"
 * Activity reference. Server-rendered, read-only data with a client-side pager
 * that reads/writes the URL search params so the server page stays the single
 * source of truth. Nothing here mutates — the audit trail is append-only and
 * viewed, never edited.
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
      <Card glow className="flex flex-col items-center gap-3 px-4 py-14 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon name="shield" className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium text-ink-700 dark:text-ink-200">No audit entries</p>
        <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
          No privileged actions match your filters yet.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card glow>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-500 dark:text-ink-400">
                {['Staff', 'Action', 'Target', 'Details', 'When'].map((heading) => (
                  <th
                    key={heading}
                    className="border-b border-ink-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] dark:border-white/10"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-ink-200 transition last:border-0 hover:bg-ink-50 dark:border-white/10 dark:hover:bg-white/[0.025]"
                >
                  <td className="px-5 py-3.5">
                    <ActorCell name={entry.actorName} email={entry.actorEmail} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${auditActionDot(entry.action)}`}
                      />
                      <span className="font-medium text-ink-600 dark:text-ink-300">
                        {auditActionLabel(entry.action)}
                      </span>
                    </span>
                  </td>
                  <td
                    className="px-5 py-3.5 text-ink-600 dark:text-ink-300"
                    title={entry.targetEmail ?? undefined}
                  >
                    {entry.targetName ?? entry.targetEmail ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-ink-400 dark:text-ink-500">
                    <MetadataCell metadata={entry.metadata} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-ink-500 dark:text-ink-400">
                    {formatWhen(entry.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Footer + pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="font-mono tabular-nums">
          Showing {from}–{to} of {total} entries
        </span>
        <div className="flex gap-2">
          <Btn
            v="outline"
            size="sm"
            icon="chevronLeft"
            disabled={!hasPrev}
            onClick={() => startTransition(() => router.replace(pageHref(page - 1)))}
          >
            Previous
          </Btn>
          <Btn
            v="outline"
            size="sm"
            iconRight="chevronRight"
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
