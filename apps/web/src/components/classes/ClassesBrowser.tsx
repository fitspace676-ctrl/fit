'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, EmptyState, SegmentedControl, Spinner } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { DEFAULT_CLASS_VIEW, type ClassCalendarView, type ClassInstanceCard } from '@fit/types';
import { Icon } from '@/src/components/ui';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchClassInstances } from '@/lib/classes';
import { ClassDetailDrawer } from './ClassDetailDrawer';
import { ClassFilters } from './ClassFilters';
import { ClassListView } from './ClassListView';
import { EmptyClasses } from './EmptyClasses';
import { WeekCalendar } from './WeekCalendar';
import {
  applyFilters,
  deriveFacets,
  EMPTY_FILTERS,
  writeFilterParams,
  type ClassFilterState,
} from './class-filters';
import { dayKey, parseWeekParam, weekWindow } from './date-utils';

// Astryx migration (T11), now on the portal kit: the browser shell — the week/list segmented
// toggle, the loading / error / no-match states — is rebuilt on the portal kit
// `Card` / `Button` over the FormaCore theme, authored in compiled StyleX
// (`var(--color-*)`) with no Tailwind utilities. The fetch/URL/filter logic is
// unchanged; only the presentation moved off Tailwind.
//
// KIT PASS. Three of this shell's four visible parts were private re-inventions
// of things the kit already owns, and each was drawn slightly differently:
//
//   • The Week/List toggle was a hand-rolled bordered capsule — a different
//     height, radius and border from the kit's `SegmentedControl`, which the
//     rest of the portal uses for exactly this job. It was also a row of
//     `aria-pressed` buttons rather than a radiogroup, so a keyboard user tabbed
//     through each option instead of arrowing within one stop.
//   • The error and no-match panels were bespoke centred stacks with their own
//     title/body type ramp, beside `EmptyState`, which is that stack.
//   • Loading was a bare `<p>` on the canvas: the entire schedule vanished and
//     was replaced by one grey line, so a slow week read as a broken page.
//
// All three now come from the kit. The private style block below shrank from
// nine rules to one.

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  // Loading keeps the schedule's footprint instead of collapsing to a line of
  // text, so the page does not jump when the week lands.
  loadingCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    minHeight: '18rem',
    color: 'var(--color-text-secondary)',
  },
  spinner: {
    height: '1.5rem',
    width: '1.5rem',
  },
  loadingText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  /** The capsule sits at the start of its row rather than stretching. */
  viewToggle: {
    alignSelf: 'flex-start',
  },
  stateIcon: {
    height: '2.25rem',
    width: '2.25rem',
    color: 'var(--color-text-secondary)',
  },
});

export interface ClassesBrowserProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** View parsed from `?view` on the server (defaults to `week`). */
  initialView: ClassCalendarView;
  /** `?week=YYYY-MM-DD` from the server, normalised to its Monday. */
  initialWeek: string;
  /** `?class=<id>` from the server — reopens the drawer after a login round-trip. */
  initialClassId?: string;
  /** Filters parsed from `?type/trainer/location/time` on the server. */
  initialFilters: ClassFilterState;
  /**
   * The gym's IANA zone. Every time below is read in it rather than in the
   * viewer's — a class is a wall-clock commitment at the gym.
   */
  timeZone: string;
}

/** Fetch lifecycle for the current week's classes. */
interface LoadState {
  instances: ClassInstanceCard[];
  status: 'loading' | 'ready' | 'error';
}

/**
 * Client orchestrator for the classes page: owns the view (week/list), the
 * selected week, the fetched instances, and the detail drawer. It keeps `?view`,
 * `?week`, and `?class` in the URL (via a soft router replace, no full reload)
 * so the toggle preserves the week and a shared/return link reopens the same
 * state. Week navigation refetches the matching `[from, to)` window with an
 * `AbortController` so a fast click sequence doesn't race.
 */
export function ClassesBrowser({
  gymId,
  initialView,
  initialWeek,
  initialClassId,
  initialFilters,
  timeZone,
}: ClassesBrowserProps) {
  const t = useTranslations('classes');
  const router = useRouter();
  const pathname = usePathname();

  const [view, setView] = useState<ClassCalendarView>(initialView);
  const [week, setWeek] = useState<Date>(() => parseWeekParam(initialWeek));
  const [selectedId, setSelectedId] = useState<string | null>(initialClassId ?? null);
  const [filters, setFilters] = useState<ClassFilterState>(initialFilters);
  const [load, setLoad] = useState<LoadState>({ instances: [], status: 'loading' });

  // Fetch the selected week's classes; cancel an in-flight request when the week
  // (or gym) changes. No gym in scope → nothing to load, settle as empty.
  useEffect(() => {
    if (!gymId) {
      setLoad({ instances: [], status: 'ready' });
      return;
    }

    const controller = new AbortController();
    setLoad((prev) => ({ instances: prev.instances, status: 'loading' }));

    const { from, to } = weekWindow(week);
    fetchClassInstances({ gymId, from, to, signal: controller.signal })
      .then((instances) => setLoad({ instances, status: 'ready' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setLoad({ instances: [], status: 'error' });
      });

    return () => controller.abort();
    // Keyed on gym + week: the same window backs both views, so toggling
    // week ↔ list reuses the loaded data without a refetch.
  }, [gymId, week]);

  // Reflect view / week / selection in the URL without a full reload. The ref
  // guard skips the replace when the target query is unchanged, so a soft
  // navigation can't re-trigger itself.
  const lastQuery = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== DEFAULT_CLASS_VIEW) {
      params.set('view', view);
    }
    params.set('week', dayKey(week));
    if (selectedId) {
      params.set('class', selectedId);
    }
    writeFilterParams(params, filters);
    const query = params.toString();
    if (query === lastQuery.current) {
      return;
    }
    lastQuery.current = query;
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [view, week, selectedId, filters, pathname, router]);

  const onWeekChange = useCallback((next: Date) => {
    setSelectedId(null);
    setWeek(next);
  }, []);

  // Filter options come from the loaded week; the visible set is the loaded
  // instances narrowed by the active facets. Both recompute only when their
  // inputs change, so toggling a filter is a pure in-memory pass (no refetch).
  const facets = useMemo(() => deriveFacets(load.instances), [load.instances]);
  const filtered = useMemo(() => applyFilters(load.instances, filters), [load.instances, filters]);

  // Resolve the drawer against the full set, not the filtered one, so a deep
  // link (`?class=<id>`) still opens even when the current filters hide it.
  const selectedInstance = useMemo(
    () => load.instances.find((instance) => instance.id === selectedId) ?? null,
    [load.instances, selectedId],
  );

  return (
    <div {...stylex.props(styles.root)}>
      <SegmentedControl
        label={t('toggle.label')}
        value={view}
        onChange={setView}
        options={[
          { value: 'week', label: t('toggle.week') },
          { value: 'list', label: t('toggle.list') },
        ]}
        xstyle={styles.viewToggle}
      />

      {load.status === 'ready' && load.instances.length > 0 && (
        <ClassFilters facets={facets} filters={filters} onChange={setFilters} />
      )}

      {load.status === 'loading' ? (
        <Card padding="none" xstyle={styles.loadingCard}>
          <Spinner xstyle={styles.spinner} />
          <p {...stylex.props(styles.loadingText)}>{t('loading')}</p>
        </Card>
      ) : load.status === 'error' ? (
        <Card>
          <EmptyState
            icon={<Icon name="info" {...stylex.props(styles.stateIcon)} />}
            title={t('error')}
            action={
              <Button
                variant="secondary"
                size="card"
                label={t('retry')}
                onClick={() => setWeek(new Date(week))}
              />
            }
          />
        </Card>
      ) : load.instances.length > 0 && filtered.length === 0 ? (
        // Classes exist this week but the active filters exclude them all — a
        // distinct state from "no classes this week", with a one-tap reset.
        <Card>
          <EmptyState
            icon={<Icon name="filter" {...stylex.props(styles.stateIcon)} />}
            title={t('filters.noMatch.title')}
            body={t('filters.noMatch.subtitle')}
            action={
              <Button
                variant="secondary"
                size="card"
                label={t('filters.noMatch.action')}
                onClick={() => setFilters(EMPTY_FILTERS)}
              />
            }
          />
        </Card>
      ) : view === 'week' ? (
        <WeekCalendar
          timeZone={timeZone}
          instances={filtered}
          week={week}
          onWeekChange={onWeekChange}
          onClassClick={setSelectedId}
        />
      ) : filtered.length === 0 ? (
        <EmptyClasses />
      ) : (
        <ClassListView instances={filtered} onClassClick={setSelectedId} timeZone={timeZone} />
      )}

      <ClassDetailDrawer
        instance={selectedInstance}
        onClose={() => setSelectedId(null)}
        timeZone={timeZone}
      />
    </div>
  );
}
