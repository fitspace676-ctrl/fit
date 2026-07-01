'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TrainerCard as TrainerCardModel } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchTrainers } from '@/lib/trainers';
import { Btn } from '@/src/components/ui';
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
    <div className="flex flex-col gap-6">
      {load.status === 'ready' && load.trainers.length > 0 && (
        <TrainerFilters facets={facets} filters={filters} onChange={setFilters} />
      )}

      {load.status === 'loading' ? (
        <p className="py-16 text-center text-sm text-ink-400">{t('loading')}</p>
      ) : load.status === 'error' ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-ink-500 dark:text-ink-400">{t('error')}</p>
          <Btn v="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            {t('retry')}
          </Btn>
        </div>
      ) : load.trainers.length === 0 ? (
        <EmptyTrainers />
      ) : filtered.length === 0 ? (
        // Trainers exist but the active filters exclude them all — a distinct
        // state from "no trainers", with a one-tap reset.
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm font-semibold text-ink-900 dark:text-white">
            {t('filters.noMatch.title')}
          </p>
          <p className="text-sm text-ink-500 dark:text-ink-400">{t('filters.noMatch.subtitle')}</p>
          <Btn v="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            {t('filters.noMatch.action')}
          </Btn>
        </div>
      ) : (
        <TrainersGrid trainers={filtered} />
      )}
    </div>
  );
}
