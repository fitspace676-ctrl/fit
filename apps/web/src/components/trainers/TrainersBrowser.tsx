'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import type { TrainerCard as TrainerCardModel } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchTrainers } from '@/lib/trainers';
import { EmptyTrainers } from './EmptyTrainers';
import { TrainerFilters } from './TrainerFilters';
import { TrainersGrid } from './TrainersGrid';
import {
  applyFilters,
  deriveFacets,
  EMPTY_FILTERS,
  writeFilterParams,
  type TrainerFilterState,
} from './trainer-filters';

// Astryx migration (T11.13): the orchestrator's loading / error / no-match
// states are authored in compiled StyleX over the Fit brand tokens and the retry
// / reset actions render the Astryx `Button` — no Tailwind utilities. The fetch
// lifecycle and URL-sync logic below are unchanged; only the presentation moved
// off Tailwind.

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  status: {
    paddingBlock: '4rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-disabled)',
  },
  stateBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '4rem',
    textAlign: 'center',
  },
  stateText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  stateTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
});

export interface TrainersBrowserProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** Filters parsed from `?specialty/location/q` on the server. */
  initialFilters: TrainerFilterState;
}

/** Fetch lifecycle for the gym's roster. */
interface LoadState {
  trainers: TrainerCardModel[];
  status: 'loading' | 'ready' | 'error';
}

/**
 * Client orchestrator for the trainers index: fetches the gym's roster once,
 * owns the filter state, and renders the filter cards + the card grid. It keeps
 * `?specialty`, `?location`, and `?q` in the URL (via a soft router replace, no
 * full reload) so a shared/return link reopens the same filtered view. Filtering
 * is a pure in-memory pass over the loaded roster — no refetch.
 */
export function TrainersBrowser({ gymId, initialFilters }: TrainersBrowserProps) {
  const t = useTranslations('trainers');
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = useState<TrainerFilterState>(initialFilters);
  const [load, setLoad] = useState<LoadState>({ trainers: [], status: 'loading' });
  // Bumped by "Try again" to re-run the fetch effect after a failure.
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch the gym's trainers; cancel an in-flight request on unmount, a gym
  // change, or a retry. No gym in scope → nothing to load, settle as empty.
  useEffect(() => {
    if (!gymId) {
      setLoad({ trainers: [], status: 'ready' });
      return;
    }

    const controller = new AbortController();
    setLoad((prev) => ({ trainers: prev.trainers, status: 'loading' }));

    fetchTrainers({ gymId, signal: controller.signal })
      .then((trainers) => setLoad({ trainers, status: 'ready' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setLoad({ trainers: [], status: 'error' });
      });

    return () => controller.abort();
  }, [gymId, reloadKey]);

  // Reflect the active filters in the URL without a full reload. The ref guard
  // skips the replace when the target query is unchanged, so a soft navigation
  // can't re-trigger itself.
  const lastQuery = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams();
    writeFilterParams(params, filters);
    const query = params.toString();
    if (query === lastQuery.current) {
      return;
    }
    lastQuery.current = query;
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [filters, pathname, router]);

  // Filter options come from the loaded roster; the visible set is that roster
  // narrowed by the active facets. Both recompute only when their inputs change.
  const facets = useMemo(() => deriveFacets(load.trainers), [load.trainers]);
  const filtered = useMemo(() => applyFilters(load.trainers, filters), [load.trainers, filters]);

  return (
    <div {...stylex.props(styles.root)}>
      {load.status === 'ready' && load.trainers.length > 0 && (
        <TrainerFilters facets={facets} filters={filters} onChange={setFilters} />
      )}

      {load.status === 'loading' ? (
        <p {...stylex.props(styles.status)}>{t('loading')}</p>
      ) : load.status === 'error' ? (
        <div {...stylex.props(styles.stateBlock)}>
          <p {...stylex.props(styles.stateText)}>{t('error')}</p>
          <Button
            variant="secondary"
            size="sm"
            label={t('retry')}
            onClick={() => setReloadKey((key) => key + 1)}
          />
        </div>
      ) : load.trainers.length === 0 ? (
        <EmptyTrainers />
      ) : filtered.length === 0 ? (
        // Trainers exist but the active filters exclude them all — a distinct
        // state from "no trainers", with a one-tap reset.
        <div {...stylex.props(styles.stateBlock)}>
          <p {...stylex.props(styles.stateTitle)}>{t('filters.noMatch.title')}</p>
          <p {...stylex.props(styles.stateText)}>{t('filters.noMatch.subtitle')}</p>
          <Button
            variant="secondary"
            size="sm"
            label={t('filters.noMatch.action')}
            onClick={() => setFilters(EMPTY_FILTERS)}
          />
        </div>
      ) : (
        <TrainersGrid trainers={filtered} />
      )}
    </div>
  );
}
