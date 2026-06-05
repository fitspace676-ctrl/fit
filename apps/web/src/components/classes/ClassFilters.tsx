'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
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
 * The classes-page filter bar (T3.5): multi-select type pills, single-select
 * trainer and location dropdowns, and a time-of-day band toggle. Options come
 * from the {@link ClassFacets} the parent derives from the loaded week, with one
 * twist — a value the visitor selected on another week is kept in its control
 * even when absent here, so the selection stays visible and removable across
 * week navigation. Stateless: every change is lifted to `onChange`; the parent
 * owns the {@link ClassFilterState} and mirrors it to the URL.
 */
export function ClassFilters({ facets, filters, onChange }: ClassFiltersProps) {
  const t = useTranslations('classes.filters');
  const trainerId = useId();
  const locationId = useId();

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

  return (
    <div role="group" aria-label={t('groupLabel')} className="flex flex-col gap-4">
      {typeOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {t('type')}
          </span>
          <div className="flex flex-wrap gap-2">
            {typeOptions.map((option) => {
              const active = filters.types.includes(option.name);
              return (
                <button
                  key={option.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleType(option.name)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    active
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option.color && (
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  {option.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
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
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {t('time')}
          </span>
          <div className="inline-flex self-start rounded-card border border-slate-200 p-0.5">
            {(['any', ...TIME_BANDS] as const).map((band) => {
              const active = filters.time === band;
              return (
                <button
                  key={band}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTime(band)}
                  className={`rounded-[0.5rem] px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {band === 'any' ? t('anyTime') : t(band)}
                </button>
              );
            })}
          </div>
        </div>

        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={() => onChange({ types: [], trainer: null, location: null, time: 'any' })}
            className="self-end rounded-card px-3 py-1.5 text-sm font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline"
          >
            {t('clear')}
          </button>
        )}
      </div>
    </div>
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
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="rounded-card border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:border-brand-600 focus:outline-none"
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
