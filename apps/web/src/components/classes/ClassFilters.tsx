'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Btn, Card, Icon } from '@/src/components/ui';
import {
  hasActiveFilters,
  TIME_BANDS,
  type ClassFacets,
  type ClassFilterState,
  type TimeBand,
} from './class-filters';

export interface ClassFiltersProps {
  /** Distinct option values present in the loaded week (drives the controls). */
  facets: ClassFacets;
  /** Current selection. */
  filters: ClassFilterState;
  /** Called with the next selection whenever a control changes. */
  onChange: (next: ClassFilterState) => void;
}

/**
 * The classes-page filter bar (T3.5): a horizontal strip of category chips
 * ("All" + each type) plus a "Filters" popover holding the single-select trainer
 * / location dropdowns and the time-of-day band toggle. Options come from the
 * {@link ClassFacets} the parent derives from the loaded week, with one twist — a
 * value the visitor selected on another week is kept in its control even when
 * absent here, so the selection stays visible and removable across week
 * navigation. Stateless: every change is lifted to `onChange`; the parent owns
 * the {@link ClassFilterState} and mirrors it to the URL.
 */
export function ClassFilters({ facets, filters, onChange }: ClassFiltersProps) {
  const t = useTranslations('classes.filters');
  const trainerId = useId();
  const locationId = useId();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close the popover on an outside click or Escape.
  useEffect(() => {
    if (!popoverOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setPopoverOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setPopoverOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [popoverOpen]);

  // Keep selected-but-absent types removable (rendered without a colour swatch).
  const selectedAbsentTypes = filters.types
    .filter((name) => !facets.types.some((facet) => facet.name === name))
    .map((name) => ({ name, color: '' }));
  const typeOptions = [...facets.types, ...selectedAbsentTypes];

  // Merge the active selection into the dropdown options so a trainer / location
  // not teaching this week still appears (and can be switched back to "all").
  const trainerOptions = mergeSelected(facets.trainers, filters.trainer);
  const locationOptions = mergeSelected(facets.locations, filters.location);

  const toggleType = (name: string) => {
    const types = filters.types.includes(name)
      ? filters.types.filter((value) => value !== name)
      : [...filters.types, name];
    onChange({ ...filters, types });
  };

  const setTime = (band: TimeBand) => onChange({ ...filters, time: band });

  // How many of the popover's facets are constraining the result (badge count).
  const popoverActive =
    (filters.trainer ? 1 : 0) + (filters.location ? 1 : 0) + (filters.time !== 'any' ? 1 : 0);

  return (
    <div role="group" aria-label={t('groupLabel')} className="flex flex-wrap items-center gap-2">
      {typeOptions.length > 0 &&
        typeOptions.map((option) => (
          <Chip
            key={option.name}
            active={filters.types.includes(option.name)}
            onClick={() => toggleType(option.name)}
          >
            {option.color && (
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: option.color }}
              />
            )}
            {option.name}
          </Chip>
        ))}

      {(trainerOptions.length > 0 || locationOptions.length > 0) && (
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            aria-expanded={popoverOpen}
            onClick={() => setPopoverOpen((open) => !open)}
            className={`inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              popoverActive > 0
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-200'
                : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:text-ink-300 dark:hover:bg-white/5'
            }`}
          >
            <Icon name="filter" className="h-4 w-4" sw={2} />
            {t('groupLabel')}
            {popoverActive > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">
                {popoverActive}
              </span>
            )}
          </button>

          {popoverOpen && (
            <Card
              glow
              className="absolute right-0 z-30 mt-2 flex w-72 flex-col gap-4 p-4 sm:left-0 sm:right-auto"
            >
              {trainerOptions.length > 0 && (
                <SelectFacet
                  id={trainerId}
                  label={t('trainer')}
                  allLabel={t('allTrainers')}
                  value={filters.trainer}
                  options={trainerOptions}
                  onChange={(trainer) => onChange({ ...filters, trainer })}
                />
              )}

              {locationOptions.length > 0 && (
                <SelectFacet
                  id={locationId}
                  label={t('location')}
                  allLabel={t('allLocations')}
                  value={filters.location}
                  options={locationOptions}
                  onChange={(location) => onChange({ ...filters, location })}
                />
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  {t('time')}
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['any', ...TIME_BANDS] as const).map((band) => {
                    const active = filters.time === band;
                    return (
                      <button
                        key={band}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setTime(band)}
                        className={`rounded-btn px-3 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? 'bg-[linear-gradient(135deg,#6257E3,#7A5AF8)] text-white'
                            : 'border border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:text-ink-300 dark:hover:bg-white/5'
                        }`}
                      >
                        {band === 'any' ? t('anyTime') : t(band)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {hasActiveFilters(filters) && (
        <Btn
          v="ghost"
          size="sm"
          onClick={() => onChange({ types: [], trainer: null, location: null, time: 'any' })}
        >
          {t('clear')}
        </Btn>
      )}
    </div>
  );
}

/** A pill-shaped category / "All" chip. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'border-transparent bg-[linear-gradient(135deg,#6257E3,#7A5AF8)] text-white shadow-[0_6px_24px_-8px_rgba(98,87,227,0.7)]'
          : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:text-ink-300 dark:hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

/** A single-select dropdown facet with an "all" sentinel mapped to `null`. */
function SelectFacet({
  id,
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  value: string | null;
  options: string[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-ink-400">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-11 rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

/** `options` with `selected` appended when it isn't already present (kept sorted). */
function mergeSelected(options: string[], selected: string | null): string[] {
  if (!selected || options.includes(selected)) {
    return options;
  }
  return [...options, selected].sort((a, b) => a.localeCompare(b));
}
