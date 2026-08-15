'use client';

import { useEffect, useId, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/src/components/ui';
import {
  hasActiveFilters,
  TIME_BANDS,
  type ClassFacets,
  type ClassFilterState,
  type TimeBand,
} from './class-filters';

// Astryx migration (T11.12): the filter strip is rebuilt on the Astryx `Card` /
// `Button` over the Fit brand theme, with the category chips, the filter
// popover, the select facets, and the time-band toggle authored in compiled
// StyleX (`var(--color-*)`) — no Tailwind utilities and no formacore
// Aurora-glass primitives. Behaviour is unchanged: every change is lifted to
// `onChange`; the parent owns the state and mirrors it to the URL.

const styles = stylex.create({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingInline: '0.875rem',
    paddingBlock: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: '150ms',
  },
  chipIdle: {
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-secondary)',
  },
  chipActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  chipDot: {
    height: '0.5rem',
    width: '0.5rem',
    borderRadius: 'var(--radius-full)',
  },
  popoverAnchor: {
    position: 'relative',
  },
  filterBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingInline: '0.875rem',
    paddingBlock: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: '150ms',
  },
  filterBtnIdle: {
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-secondary)',
  },
  filterBtnActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  filterIcon: {
    height: '1rem',
    width: '1rem',
  },
  countBadge: {
    marginLeft: '0.125rem',
    display: 'inline-flex',
    height: '1.25rem',
    minWidth: '1.25rem',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    paddingInline: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--color-on-accent)',
  },
  popover: {
    position: 'absolute',
    right: 0,
    top: '100%',
    zIndex: 30,
    marginTop: '0.5rem',
    display: 'flex',
    width: '18rem',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1rem',
    '@media (min-width: 640px)': {
      left: 0,
      right: 'auto',
    },
  },
  facet: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  facetLabel: {
    fontSize: '0.75rem',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-secondary)',
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
  timeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.375rem',
  },
  timeBtn: {
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: '150ms',
  },
  timeBtnIdle: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-secondary)',
  },
  timeBtnActive: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
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
    <div role="group" aria-label={t('groupLabel')} {...stylex.props(styles.root)}>
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
                {...stylex.props(styles.chipDot)}
                style={{ backgroundColor: option.color }}
              />
            )}
            {option.name}
          </Chip>
        ))}

      {(trainerOptions.length > 0 || locationOptions.length > 0) && (
        <div {...stylex.props(styles.popoverAnchor)} ref={popoverRef}>
          <button
            type="button"
            aria-expanded={popoverOpen}
            onClick={() => setPopoverOpen((open) => !open)}
            {...stylex.props(
              styles.filterBtn,
              popoverActive > 0 ? styles.filterBtnActive : styles.filterBtnIdle,
            )}
          >
            <Icon name="filter" {...stylex.props(styles.filterIcon)} sw={2} />
            {t('groupLabel')}
            {popoverActive > 0 && <span {...stylex.props(styles.countBadge)}>{popoverActive}</span>}
          </button>

          {popoverOpen && (
            <Card variant="default" padding={0} xstyle={styles.popover}>
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
                          styles.timeBtn,
                          active ? styles.timeBtnActive : styles.timeBtnIdle,
                        )}
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
        <Button
          variant="ghost"
          size="sm"
          label={t('clear')}
          onClick={() => onChange({ types: [], trainer: null, location: null, time: 'any' })}
        />
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
      {...stylex.props(styles.chip, active ? styles.chipActive : styles.chipIdle)}
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
    <div {...stylex.props(styles.facet)}>
      <label htmlFor={id} {...stylex.props(styles.facetLabel)}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        {...stylex.props(styles.select)}
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
