'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useActiveLocation } from '@/components/active-location';
import { LOCATION_PARAM } from '@/lib/active-location';
import { INVOICE_TYPES } from './format';

/** Shared control styling, matching the console's other filter bars. */
const CONTROL_CLASS =
  'h-10 rounded-field border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white';

/** How long the search box waits after the last keystroke before navigating. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The invoice roster's filters, held in the URL rather than component state.
 *
 * That is deliberate: the page is server-rendered, so the filters *are* the query the
 * server runs. Keeping them in the URL means a filtered view is linkable, survives a
 * refresh, and needs no client-side copy of the roster to re-filter. Every change
 * resets to page 1 — staying on page 4 of a narrower result set would show an empty
 * table.
 */
export function InvoiceFilters({
  search,
  type,
  issuedFrom,
  issuedTo,
}: {
  search: string;
  type: string;
  issuedFrom: string;
  issuedTo: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [draftSearch, setDraftSearch] = useState(search);

  // The branch select is a SECOND way into the param the top-bar switcher owns
  // (`?locationId=`), so the two are never on screen together: this renders only
  // while the console is on "All locations", and picking a branch here hands the
  // axis to the switcher — which then names the branch, and this control
  // disappears. Two live controls writing one param is how they end up
  // disagreeing, and the switcher is the one that also persists the choice in the
  // cookie, so it is the one that must win. Deselecting is therefore done in the
  // chrome, where the current branch is actually named. Same rule the members
  // filter bar follows.
  const { locationId: activeLocationId, locations } = useActiveLocation();
  const showBranchFilter = activeLocationId === undefined && locations.length > 0;

  // Re-seed the box when the URL changes underneath (back/forward, or a reset).
  useEffect(() => setDraftSearch(search), [search]);

  function apply(next: Record<string, string>): void {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    // A narrowed result set rarely has the page the staffer was on.
    query.delete('page');
    const qs = query.toString();
    // `replace`, not `push`. This bar shipped with `push` and it was incidental, not
    // a decision: nothing recorded a reason, every other filter bar in the console
    // replaces (`members`, `pos/orders`, `shop`, `classes`, `services`, `packages`,
    // and `segmented-dashboard`, which spells out "so switching tabs does not
    // stack"), and `push` is actively wrong beside the debounced search above —
    // every pause in typing would stack another history entry, so backing out of
    // the roster would mean walking the search term back one burst at a time. It is
    // also what the branch hand-off needs: the switcher's own `setActive` replaces,
    // so a branch chosen here and then changed in the chrome leaves one entry
    // rather than two views of the same screen.
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // Debounce the search so typing doesn't fire a navigation per keystroke.
  useEffect(() => {
    if (draftSearch === search) return;
    // `apply` closes over the current params by design; only the draft value should
    // retrigger this, so it is deliberately not a dependency.
    const timer = setTimeout(() => apply({ search: draftSearch }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftSearch, search]);

  // Deliberately not counting the branch: `apply` preserves the params it is not
  // given, so Clear leaves `?locationId=` alone — by the time a branch is chosen
  // this control has handed the axis to the header switcher, and that is where it
  // is deselected. A Clear that silently widened the whole console back to every
  // branch would undo a choice made somewhere else on screen.
  const hasFilters = Boolean(search || type || issuedFrom || issuedTo);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[16rem] flex-1">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          sw={2}
        />
        <input
          type="search"
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="Search invoice #, description or member…"
          aria-label="Search invoices"
          className={`${CONTROL_CLASS} w-full pl-9`}
        />
      </div>

      <select
        value={type}
        onChange={(event) => apply({ type: event.target.value })}
        aria-label="Filter by type"
        className={CONTROL_CLASS}
      >
        <option value="">All types</option>
        {INVOICE_TYPES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {showBranchFilter ? (
        <select
          // Always `''` while it renders: a chosen branch lands in the URL, the
          // top-bar switcher adopts it, and this control unmounts. See
          // `showBranchFilter`.
          value=""
          onChange={(event) => apply({ [LOCATION_PARAM]: event.target.value })}
          aria-label="Filter by branch"
          className={CONTROL_CLASS}
        >
          <option value="">All branches</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      ) : null}

      <input
        type="date"
        value={issuedFrom}
        onChange={(event) => apply({ issuedFrom: event.target.value })}
        aria-label="Issued from"
        className={CONTROL_CLASS}
      />
      <input
        type="date"
        value={issuedTo}
        onChange={(event) => apply({ issuedTo: event.target.value })}
        aria-label="Issued to"
        className={CONTROL_CLASS}
      />

      {hasFilters ? (
        <button
          type="button"
          onClick={() => apply({ search: '', type: '', issuedFrom: '', issuedTo: '' })}
          className="text-sm font-medium text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
