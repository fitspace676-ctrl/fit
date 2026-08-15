'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { DEFAULT_CLASS_VIEW, type ClassCalendarView, type ClassInstanceCard } from '@fit/types';
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

// Astryx migration (T11.12): the browser shell — the week/list segmented
// toggle, the loading / error / no-match states — is rebuilt on the Astryx
// `Card` / `Button` over the Fit brand theme, authored in compiled StyleX
// (`var(--color-*)`) with no Tailwind utilities. The fetch/URL/filter logic is
// unchanged; only the presentation moved off Tailwind.

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  toggle: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '0.125rem',
  },
  toggleBtn: {
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    paddingInline: '1rem',
    paddingBlock: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  toggleBtnIdle: {
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-secondary)',
  },
  toggleBtnActive: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  loading: {
    paddingBlock: '4rem',
    margin: 0,
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  stateCard: {
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
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
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
      <ViewToggle
        view={view}
        onChange={setView}
        weekLabel={t('toggle.week')}
        listLabel={t('toggle.list')}
        groupLabel={t('toggle.label')}
      />

      {load.status === 'ready' && load.instances.length > 0 && (
        <ClassFilters facets={facets} filters={filters} onChange={setFilters} />
      )}

      {load.status === 'loading' ? (
        <p {...stylex.props(styles.loading)}>{t('loading')}</p>
      ) : load.status === 'error' ? (
        <Card variant="default" padding={0} xstyle={styles.stateCard}>
          <p {...stylex.props(styles.stateText)}>{t('error')}</p>
          <Button
            variant="secondary"
            size="sm"
            label={t('retry')}
            onClick={() => setWeek(new Date(week))}
          />
        </Card>
      ) : load.instances.length > 0 && filtered.length === 0 ? (
        // Classes exist this week but the active filters exclude them all — a
        // distinct state from "no classes this week", with a one-tap reset.
        <Card variant="default" padding={0} xstyle={styles.stateCard}>
          <p {...stylex.props(styles.stateTitle)}>{t('filters.noMatch.title')}</p>
          <p {...stylex.props(styles.stateText)}>{t('filters.noMatch.subtitle')}</p>
          <Button
            variant="secondary"
            size="sm"
            label={t('filters.noMatch.action')}
            onClick={() => setFilters(EMPTY_FILTERS)}
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

/** Segmented Week / List toggle. */
function ViewToggle({
  view,
  onChange,
  weekLabel,
  listLabel,
  groupLabel,
}: {
  view: ClassCalendarView;
  onChange: (view: ClassCalendarView) => void;
  weekLabel: string;
  listLabel: string;
  groupLabel: string;
}) {
  return (
    <div role="group" aria-label={groupLabel} {...stylex.props(styles.toggle)}>
      {(['week', 'list'] as const).map((value) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(value)}
            {...stylex.props(
              styles.toggleBtn,
              active ? styles.toggleBtnActive : styles.toggleBtnIdle,
            )}
          >
            {value === 'week' ? weekLabel : listLabel}
          </button>
        );
      })}
    </div>
  );
}
