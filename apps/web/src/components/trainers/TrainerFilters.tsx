'use client';

import { useId } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { hasActiveFilters, type TrainerFacets, type TrainerFilterState } from './trainer-filters';

// Astryx migration (T11.13): the filter card is rebuilt on the Astryx `Card`
// over the Fit brand theme, with the search box, location select, specialty
// pills, and clear action authored in compiled StyleX (`var(--color-*)`) — no
// Tailwind utilities and no formacore Aurora-glass primitives. Behaviour is
// unchanged: every change is lifted to `onChange`; the parent owns the state and
// mirrors it to the URL.

const styles = stylex.create({
  card: {
    padding: '1.25rem',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: '1rem',
  },
  searchField: {
    display: 'flex',
    minWidth: '14rem',
    flex: 1,
    flexDirection: 'column',
    gap: '0.375rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-secondary)',
  },
  input: {
    height: '2.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-card)',
    paddingInline: '0.875rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    '::placeholder': {
      color: 'var(--color-text-disabled)',
    },
  },
  select: {
    height: '2.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-card)',
    paddingInline: '0.875rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  clear: {
    height: '2.75rem',
    alignSelf: 'flex-end',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'transparent',
    paddingInline: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
  specialtyBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: '150ms',
  },
  pillIdle: {
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-secondary)',
  },
  pillActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
});

export interface TrainerFiltersProps {
  /** Distinct option values present in the loaded roster (drives the controls). */
  facets: TrainerFacets;
  /** Current selection. */
  filters: TrainerFilterState;
  /** Called with the next selection whenever a control changes. */
  onChange: (next: TrainerFilterState) => void;
}

/**
 * The trainers-index filter card (T3.6): a name search box, multi-select
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
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div role="group" aria-label={t('groupLabel')} {...stylex.props(styles.group)}>
        <div {...stylex.props(styles.controls)}>
          <div {...stylex.props(styles.searchField)}>
            <label htmlFor={searchId} {...stylex.props(styles.label)}>
              {t('search')}
            </label>
            <input
              id={searchId}
              type="search"
              value={filters.search}
              onChange={(event) => onChange({ ...filters, search: event.target.value })}
              placeholder={t('searchPlaceholder')}
              {...stylex.props(styles.input)}
            />
          </div>

          {locationOptions.length > 0 && (
            <div {...stylex.props(styles.field)}>
              <label htmlFor={locationId} {...stylex.props(styles.label)}>
                {t('location')}
              </label>
              <select
                id={locationId}
                value={filters.location ?? ''}
                onChange={(event) => onChange({ ...filters, location: event.target.value || null })}
                {...stylex.props(styles.select)}
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
              {...stylex.props(styles.clear)}
            >
              {t('clear')}
            </button>
          )}
        </div>

        {specialtyOptions.length > 0 && (
          <div {...stylex.props(styles.specialtyBlock)}>
            <span {...stylex.props(styles.label)}>{t('specialty')}</span>
            <div {...stylex.props(styles.pillRow)}>
              {specialtyOptions.map((option) => {
                const active = filters.specialties.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleSpecialty(option)}
                    {...stylex.props(styles.pill, active ? styles.pillActive : styles.pillIdle)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** `options` with `selected` appended when it isn't already present (kept sorted). */
function mergeSelected(options: string[], selected: string | null): string[] {
  if (!selected || options.includes(selected)) {
    return options;
  }
  return [...options, selected].sort((a, b) => a.localeCompare(b));
}
