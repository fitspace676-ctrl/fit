'use client';

import { useState } from 'react';
import type { PendingInvite, StaffMember } from '@fit/types';
import { Card } from '@/components/ui';
import { Glyph, type StaffGlyphName } from './icons';
import { PendingInvites } from './pending-invites';
import { StaffTable } from './staff-table';

/** The sub-views under the page header, per the reference's tab bar. */
const TABS = [
  { id: 'people', label: 'People' },
  { id: 'invitations', label: 'Invitations' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** The engine gradient shared by the primary controls (Planflow "formacore"). */
const ENGINE_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

/** One roster KPI card — tone-coloured icon, headline value, uppercase label. */
function KpiCard({
  icon,
  tone,
  value,
  label,
}: {
  icon: StaffGlyphName;
  tone: string;
  value: number;
  label: string;
}) {
  return (
    <Card glow className="p-4 sm:p-5">
      <Glyph name={icon} className={`h-5 w-5 ${tone}`} />
      <div className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
        {label}
      </div>
    </Card>
  );
}

/**
 * The staff screen body (T4.7), reskinned to the Planflow "formacore" reference:
 * a People / Invitations tab bar under the page header, the four KPI cards, and
 * the active tab's content — the staff table (with its search + role-filter
 * toolbar) or the pending-invitations list. Every KPI is computed from the real
 * `GET /staff` response; nothing here mutates data.
 */
export function StaffView({
  staff,
  invites,
  currentUserId,
}: {
  staff: StaffMember[];
  invites: PendingInvite[];
  currentUserId: string | null;
}) {
  const [tab, setTab] = useState<TabId>('people');

  const kpis: Array<{ icon: StaffGlyphName; tone: string; value: number; label: string }> = [
    { icon: 'shield', tone: 'text-brand-400', value: staff.length, label: 'Total staff' },
    {
      icon: 'pulse',
      tone: 'text-success-400',
      value: staff.filter((member) => member.status === 'ACTIVE').length,
      label: 'Active',
    },
    { icon: 'mail', tone: 'text-warning-400', value: invites.length, label: 'Pending invites' },
    {
      icon: 'key',
      tone: 'text-iris-400',
      value: new Set(staff.map((member) => member.role)).size,
      label: 'Distinct roles',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* sub-tabs */}
      <div
        role="tablist"
        aria-label="Staff views"
        className="flex items-center gap-5 border-b border-ink-200 dark:border-white/10"
      >
        {TABS.map((option) => {
          const active = option.id === tab;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(option.id)}
              className={`relative pb-2.5 text-sm font-semibold transition-colors ${
                active
                  ? 'text-ink-900 dark:text-white'
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
              }`}
            >
              {option.label}
              {active && (
                <span
                  aria-hidden
                  className={`absolute -bottom-px left-0 right-0 h-0.5 rounded-full ${ENGINE_GRADIENT}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {tab === 'people' ? (
        <StaffTable staff={staff} currentUserId={currentUserId} />
      ) : (
        <PendingInvites invites={invites} />
      )}
    </div>
  );
}
