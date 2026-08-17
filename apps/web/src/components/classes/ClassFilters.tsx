'use client';

import { useState } from 'react';
import { Button, Popover, SelectField } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Icon } from '@/src/components/ui';
import {
  hasActiveFilters,
  TIME_BANDS,
  type ClassFacets,
  type ClassFilterState,
  type TimeBand,
} from './class-filters';

// Astryx migration (T11), now on the portal kit: the filter strip is rebuilt on the kit over the
// FormaCore theme, authored in compiled StyleX (`var(--color-*)`) — no Tailwind
// utilities and no formacore Aurora-glass primitives. Behaviour is unchanged:
// every change is lifted to `onChange`; the parent owns the state and mirrors it
// to the URL.
//
// KIT PASS. The strip was drawn in three different pill vocabularies that all
// meant "a small toggle": the category chip, the Filters trigger and the
// time-band button each had their own height, radius, border and padding, so a
// row that is conceptually one control read as a scatter of unrelated buttons.
// They are one vocabulary now — the kit's chip: 2rem tall, `--radius-inner`,
// borderless, lime when selected.
//
// The categories also sit in a recessed track (`--color-background-muted`), the
// same seat the kit gives `FilterChips` and `SegmentedControl`. That is what
// makes them read as one multi-select group rather than as N loose buttons —
// which matters here precisely because they are the one control on the page that
// takes several selections at once, and outlined pills gave no hint of that.
// `FilterChips` itself is not usable: it is a single-select `tablist`.
//
// Two hand-rolled mechanisms went with them. The popover was a private absolute
// panel with its own outside-click and Escape listeners — that is `Popover`,
// which also gets focus handling the private one never had. The trainer and
// location dropdowns were bare `<select>`s on a private field skin, beside the
// kit's `SelectField`, which is the same control with the portal's label, focus
// ring and disclosure chevron.

const styles = stylex.create({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  // The recessed seat the kit gives every chip group.
  track: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.125rem',
    maxWidth: '100%',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.25rem',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    height: '2rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: 0,
    paddingInline: '0.875rem',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  chipIdle: {
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
  },
  chipActive: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  chipDot: {
    height: '0.375rem',
    width: '0.375rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  filterIcon: {
    height: '1rem',
    width: '1rem',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1rem',
  },
  facet: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  facetLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--color-text-secondary)',
  },
  // Four bands is one too many for a capsule row inside an 18rem panel, so the
  // group stays a 2×2 grid — but in the chip vocabulary, seated in the same
  // recessed track as the categories.
  timeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.125rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.25rem',
  },
  timeChip: {
    justifyContent: 'center',
    paddingInline: '0.5rem',
  },
});

export interface ClassFiltersProps {
  /** Distinct option values present in the loaded week (drives the controls). */
  facets: ClassFacets;
  /** Current selection. */
  filters: ClassFilterState;
  /** Called with the next selection whenever a control changes. */
  onChange: (next: ClassFilterState) => void;
}

/**
 * The classes-page filter bar (T3.5): a track of multi-select category chips
 * plus a "Filters" popover holding the single-select trainer / location
 * dropdowns and the time-of-day band toggle. Options come from the
 * {@link ClassFacets} the parent derives from the loaded week, with one twist — a
 * value the visitor selected on another week is kept in its control even when
 * absent here, so the selection stays visible and removable across week
 * navigation. Stateless: every change is lifted to `onChange`; the parent owns
 * the {@link ClassFilterState} and mirrors it to the URL.
 */
export function ClassFilters({ facets, filters, onChange }: ClassFiltersProps) {
  const t = useTranslations('classes.filters');
  const [popoverOpen, setPopoverOpen] = useState(false);

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

  // How many of the popover's facets are constraining the result.
  const popoverActive =
    (filters.trainer ? 1 : 0) + (filters.location ? 1 : 0) + (filters.time !== 'any' ? 1 : 0);

  return (
    <div role="group" aria-label={t('groupLabel')} {...stylex.props(styles.root)}>
      {typeOptions.length > 0 && (
        <div {...stylex.props(styles.track)}>
          {typeOptions.map((option) => {
            const active = filters.types.includes(option.name);
            return (
              <button
                key={option.name}
                type="button"
                aria-pressed={active}
                onClick={() => toggleType(option.name)}
                {...stylex.props(styles.chip, active ? styles.chipActive : styles.chipIdle)}
              >
                {option.color && (
                  <span
                    aria-hidden="true"
                    {...stylex.props(styles.chipDot)}
                    style={{ backgroundColor: option.color }}
                  />
                )}
                {option.name}
              </button>
            );
          })}
        </div>
      )}

      {(trainerOptions.length > 0 || locationOptions.length > 0) && (
        <Popover
          open={popoverOpen}
          onClose={() => setPopoverOpen(false)}
          label={t('groupLabel')}
          align="start"
          width={288}
          trigger={
            <Button
              // Lime only when the popover is actually constraining the result —
              // an untouched filter button is a neutral control, not a signal.
              variant={popoverActive > 0 ? 'primary' : 'secondary'}
              size="card"
              aria-expanded={popoverOpen}
              icon={<Icon name="filter" {...stylex.props(styles.filterIcon)} sw={2} />}
              label={popoverActive > 0 ? `${t('groupLabel')} · ${popoverActive}` : t('groupLabel')}
              onClick={() => setPopoverOpen((open) => !open)}
            />
          }
          xstyle={styles.panel}
        >
          {trainerOptions.length > 0 && (
            <SelectField
              label={t('trainer')}
              value={filters.trainer ?? ''}
              onChange={(event) => onChange({ ...filters, trainer: event.target.value || null })}
              options={[
                { value: '', label: t('allTrainers') },
                ...trainerOptions.map((name) => ({ value: name, label: name })),
              ]}
            />
          )}

          {locationOptions.length > 0 && (
            <SelectField
              label={t('location')}
              value={filters.location ?? ''}
              onChange={(event) => onChange({ ...filters, location: event.target.value || null })}
              options={[
                { value: '', label: t('allLocations') },
                ...locationOptions.map((name) => ({ value: name, label: name })),
              ]}
            />
          )}

          <div {...stylex.props(styles.facet)}>
            <span {...stylex.props(styles.facetLabel)}>{t('time')}</span>
            <div {...stylex.props(styles.timeGrid)}>
              {(['any', ...TIME_BANDS] as const).map((band) => {
                const active = filters.time === band;
                return (
                  <button
                    key={band}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTime(band)}
                    {...stylex.props(
                      styles.chip,
                      styles.timeChip,
                      active ? styles.chipActive : styles.chipIdle,
                    )}
                  >
                    {band === 'any' ? t('anyTime') : t(band)}
                  </button>
                );
              })}
            </div>
          </div>
        </Popover>
      )}

      {hasActiveFilters(filters) && (
        <Button
          variant="ghost"
          size="card"
          label={t('clear')}
          onClick={() => onChange({ types: [], trainer: null, location: null, time: 'any' })}
        />
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
