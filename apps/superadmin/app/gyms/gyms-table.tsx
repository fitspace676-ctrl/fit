'use client';

import { useState, useTransition } from 'react';
import type { AdminGymSummary, GymStatus } from '@fit/types';
import { impersonateGymAction, setGymStatusAction } from './actions';

/** Format minor currency units (tetri) as a Georgian Lari amount. */
function formatMrr(minorUnits: number): string {
  return `₾${(minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A small status pill — green for active, amber for suspended. */
function StatusPill({ status }: { status: GymStatus }) {
  const styles =
    status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
  return (
    <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${styles}`}>
      {status === 'ACTIVE' ? 'Active' : 'Suspended'}
    </span>
  );
}

/**
 * The operator gyms table: one row per tenant with its status, member count, and
 * MRR, plus the two privileged actions — toggle suspension and impersonate the
 * owner. All mutations go through Server Actions (which re-assert SUPER_ADMIN and
 * audit-log impersonation); this component only reflects their results.
 */
export function GymsTable({ gyms }: { gyms: AdminGymSummary[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [impersonation, setImpersonation] = useState<{ gym: string; token: string } | null>(null);

  function toggleStatus(gym: AdminGymSummary) {
    const next: GymStatus = gym.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setError(null);
    setBusyId(gym.id);
    startTransition(async () => {
      const result = await setGymStatusAction(gym.id, next);
      if (!result.ok) {
        setError(result.error);
      }
      setBusyId(null);
    });
  }

  function impersonate(gym: AdminGymSummary) {
    setError(null);
    setImpersonation(null);
    setBusyId(gym.id);
    startTransition(async () => {
      const result = await impersonateGymAction(gym.id);
      if (result.ok) {
        setImpersonation({ gym: gym.name, token: result.data.accessToken });
      } else {
        setError(result.error);
      }
      setBusyId(null);
    });
  }

  if (gyms.length === 0) {
    return <p className="text-slate-500">No gyms have been provisioned yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {impersonation ? (
        <div className="rounded-card border border-brand-100 bg-brand-50 px-3 py-2 text-sm">
          <p className="font-medium text-brand-700">
            Impersonation token for {impersonation.gym} (expires shortly):
          </p>
          <code className="mt-1 block break-all font-mono text-xs text-slate-700">
            {impersonation.token}
          </code>
          <button
            type="button"
            onClick={() => setImpersonation(null)}
            className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-4 font-medium">Gym</th>
            <th className="py-2 pr-4 font-medium">Subdomain</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 text-right font-medium">Members</th>
            <th className="py-2 pr-4 text-right font-medium">MRR</th>
            <th className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {gyms.map((gym) => {
            const rowBusy = pending && busyId === gym.id;
            return (
              <tr key={gym.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 font-medium text-slate-900">{gym.name}</td>
                <td className="py-2 pr-4 text-slate-500">{gym.subdomainSlug}</td>
                <td className="py-2 pr-4">
                  <StatusPill status={gym.status} />
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
                  {gym.memberCount}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
                  {formatMrr(gym.mrr)}
                </td>
                <td className="py-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => toggleStatus(gym)}
                      className="rounded-card border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {gym.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => impersonate(gym)}
                      className="rounded-card border border-brand-200 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                    >
                      Impersonate
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
