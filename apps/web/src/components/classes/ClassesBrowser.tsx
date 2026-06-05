'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DEFAULT_CLASS_VIEW, type ClassCalendarView, type ClassInstanceCard } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchClassInstances } from '@/lib/classes';
import { ClassDetailDrawer } from './ClassDetailDrawer';
import { ClassListView } from './ClassListView';
import { EmptyClasses } from './EmptyClasses';
import { WeekCalendar } from './WeekCalendar';
import { dayKey, parseWeekParam, weekWindow } from './date-utils';

export interface ClassesBrowserProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** View parsed from `?view` on the server (defaults to `week`). */
  initialView: ClassCalendarView;
  /** `?week=YYYY-MM-DD` from the server, normalised to its Monday. */
  initialWeek: string;
  /** `?class=<id>` from the server — reopens the drawer after a login round-trip. */
  initialClassId?: string;
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
}: ClassesBrowserProps) {
  const t = useTranslations('classes');
  const router = useRouter();
  const pathname = usePathname();

  const [view, setView] = useState<ClassCalendarView>(initialView);
  const [week, setWeek] = useState<Date>(() => parseWeekParam(initialWeek));
  const [selectedId, setSelectedId] = useState<string | null>(initialClassId ?? null);
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
    const query = params.toString();
    if (query === lastQuery.current) {
      return;
    }
    lastQuery.current = query;
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [view, week, selectedId, pathname, router]);

  const onWeekChange = useCallback((next: Date) => {
    setSelectedId(null);
    setWeek(next);
  }, []);

  const selectedInstance = useMemo(
    () => load.instances.find((instance) => instance.id === selectedId) ?? null,
    [load.instances, selectedId],
  );

  return (
    <div className="flex flex-col gap-6">
      <ViewToggle
        view={view}
        onChange={setView}
        weekLabel={t('toggle.week')}
        listLabel={t('toggle.list')}
        groupLabel={t('toggle.label')}
      />

      {load.status === 'loading' ? (
        <p className="py-16 text-center text-sm text-slate-400">{t('loading')}</p>
      ) : load.status === 'error' ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-slate-500">{t('error')}</p>
          <button
            type="button"
            onClick={() => setWeek(new Date(week))}
            className="rounded-card border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {t('retry')}
          </button>
        </div>
      ) : view === 'week' ? (
        <WeekCalendar
          instances={load.instances}
          week={week}
          onWeekChange={onWeekChange}
          onClassClick={setSelectedId}
        />
      ) : load.instances.length === 0 ? (
        <EmptyClasses />
      ) : (
        <ClassListView instances={load.instances} onClassClick={setSelectedId} />
      )}

      <ClassDetailDrawer instance={selectedInstance} onClose={() => setSelectedId(null)} />
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
    <div
      role="group"
      aria-label={groupLabel}
      className="inline-flex self-start rounded-card border border-slate-200 p-0.5"
    >
      {(['week', 'list'] as const).map((value) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={`rounded-[0.5rem] px-4 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {value === 'week' ? weekLabel : listLabel}
          </button>
        );
      })}
    </div>
  );
}
