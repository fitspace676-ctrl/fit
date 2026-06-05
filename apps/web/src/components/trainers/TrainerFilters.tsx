'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { hasActiveFilters, type TrainerFacets, type TrainerFilterState } from './trainer-filters';

export interface TrainerFiltersProps {
  /** Distinct option values present in the loaded roster (drives the controls). */
  facets: TrainerFacets;
  /** Current selection. */
  filters: TrainerFilterState;
  /** Called with the next selection whenever a control changes. */
  onChange: (next: TrainerFilterState) => void;
}

/**
 * The trainers-index filter cards (T3.6): a name search box, multi-select
 * specialty pills, and a single-select location dropdown. Options come from the
 * {@link TrainerFacets} the parent derives from the loaded roster, with one
 * twist — a value the visitor selected that is no longer present is kept in its
 * control so the selection stays visible and removable. Stateless: every change
 * is lifted to `onChange`; the parent owns the {@link TrainerFilterState} and
 * mirrors it to the URL.
 */
export function TrainerFilters({ facets, filters, onChange }: TrainerFiltersProps) {
  const t = useTranslations('trainers.filters');
  const searchId = useId();
  const locationId = useId();

  // Keep a selected-but-absent specialty removable.
  const specialtyOptions = [
    ...facets.specialties,
    ...filters.specialties.filter((name) => !facets.specialties.includes(name)),
  ];
  // Merge the active location into the dropdown so one with no trainers still
  // appears (and can be switched back to "all").
  const locationOptions = mergeSelected(facets.locations, filters.location);

  const toggleSpecialty = (name: string) => {
    const specialties = filters.specialties.includes(name)
      ? filters.specialties.filter((value) => value !== name)
      : [...filters.specialties, name];
    onChange({ ...filters, specialties });
  };

  return (
    <div role="group" aria-label={t('groupLabel')} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
          <label
            htmlFor={searchId}
            className="text-xs font-medium uppercase tracking-wide text-slate-400"
          >
            {t('search')}
          </label>
          <input
            id={searchId}
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder={t('searchPlaceholder')}
            className="rounded-card border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:border-brand-600 focus:outline-none"
          />
        </div>

        {locationOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={locationId}
              className="text-xs font-medium uppercase tracking-wide text-slate-400"
            >
              {t('location')}
            </label>
            <select
              id={locationId}
              value={filters.location ?? ''}
              onChange={(event) => onChange({ ...filters, location: event.target.value || null })}
              className="rounded-card border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:border-brand-600 focus:outline-none"
            >
              <option value="">{t('allLocations')}</option>
              {locationOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}

        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={() => onChange({ specialties: [], location: null, search: '' })}
            className="self-end rounded-card px-3 py-1.5 text-sm font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline"
          >
            {t('clear')}
          </button>
        )}
      </div>

      {specialtyOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {t('specialty')}
          </span>
          <div className="flex flex-wrap gap-2">
            {specialtyOptions.map((option) => {
              const active = filters.specialties.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleSpecialty(option)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    active
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
