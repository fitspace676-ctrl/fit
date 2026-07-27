'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import type { LocationSummary } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchLocations } from '@/lib/locations';

/** sessionStorage key the wizard persists the chosen location under (T3.8). */
export const CHECKOUT_LOCATION_KEY = 'checkout_locationId';

/** Weekday keys the `hours` map is keyed by, indexed by `Date.getDay()` (0 = Sun). */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// Astryx migration (T11.15): step 1 (pick location) is rebuilt on the Fit brand
// theme — selectable location cards and status states authored in compiled
// StyleX (`var(--color-*)` / `var(--radius-*)`), the Continue / retry actions on
// the Astryx `Button` — no Tailwind utilities. Fetch, selection persistence and
// navigation are unchanged.
const styles = stylex.create({
  status: {
    paddingBlock: '4rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '4rem',
    textAlign: 'center',
  },
  centeredTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  centeredText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  grid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  card: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    textAlign: 'left',
    cursor: 'pointer',
    padding: 0,
    backgroundColor: 'var(--color-background-card)',
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
  },
  cardIdle: {
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-border-emphasized)',
    },
  },
  cardSelected: {
    borderColor: 'var(--color-accent)',
    boxShadow: 'inset 0 0 0 1px var(--color-accent)',
  },
  photo: {
    position: 'relative',
    aspectRatio: '16 / 9',
    width: '100%',
    backgroundColor: 'var(--color-background-muted)',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1rem',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  name: {
    margin: 0,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  address: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pill: {
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  pillIdle: {
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  pillSelected: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  amenities: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  amenity: {
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.625rem',
    paddingBlock: '0.125rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  hours: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  hoursValue: {
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  actionsEnd: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
});

export interface StepLocationProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** `?locationId` from the server — restores the selection after a refresh / Back. */
  initialLocationId?: string;
  /** Notified whenever the visitor picks a location card. */
  onSelect?: (locationId: string) => void;
}

/** Fetch lifecycle for the gym's locations. */
interface LoadState {
  locations: LocationSummary[];
  status: 'loading' | 'ready' | 'error';
}

/**
 * Step 1 of the purchase wizard: pick the location to buy at. Fetches the gym's
 * locations on mount, renders each as a card (photo, address, amenity chips,
 * today's hours), and gates a "Continue" button on a selection. The choice is
 * mirrored to `sessionStorage` (and the URL on Continue) so a refresh or the
 * browser Back button from step 2 restores the highlighted card.
 */
export function StepLocation({ gymId, initialLocationId, onSelect }: StepLocationProps) {
  const t = useTranslations('checkout');
  const router = useRouter();
  const pathname = usePathname();

  const [selectedId, setSelectedId] = useState<string | null>(initialLocationId ?? null);
  const [load, setLoad] = useState<LoadState>({ locations: [], status: 'loading' });

  // Restore a prior selection from sessionStorage when the URL carried none
  // (e.g. a plain refresh of step 1). The URL wins when present, so this only
  // fills the gap; it runs once on mount.
  useEffect(() => {
    if (initialLocationId) {
      return;
    }
    const stored = window.sessionStorage.getItem(CHECKOUT_LOCATION_KEY);
    if (stored) {
      setSelectedId(stored);
    }
  }, [initialLocationId]);

  // Load the gym's locations; cancel the request if the step unmounts or the gym
  // changes. No gym in scope → nothing to load, settle as empty.
  useEffect(() => {
    if (!gymId) {
      setLoad({ locations: [], status: 'ready' });
      return;
    }

    const controller = new AbortController();
    setLoad((prev) => ({ locations: prev.locations, status: 'loading' }));

    fetchLocations({ gymId, signal: controller.signal })
      .then((locations) => setLoad({ locations, status: 'ready' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setLoad({ locations: [], status: 'error' });
      });

    return () => controller.abort();
  }, [gymId]);

  const select = useCallback(
    (locationId: string) => {
      setSelectedId(locationId);
      window.sessionStorage.setItem(CHECKOUT_LOCATION_KEY, locationId);
      onSelect?.(locationId);
    },
    [onSelect],
  );

  const onContinue = useCallback(() => {
    if (!selectedId) {
      return;
    }
    const params = new URLSearchParams({ step: '2', locationId: selectedId });
    // Soft navigation (no full reload) so the wizard transitions in place.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [selectedId, pathname, router]);

  /**
   * A single-branch gym has no choice to make, so the step makes it and gets out
   * of the way — the visitor never sees a page whose only action is "confirm the
   * one option". `replace` rather than `push` so Back from step 2 skips straight
   * out of the wizard instead of landing here and bouncing forward again.
   *
   * Only when the gym really has exactly one branch: zero branches still falls
   * through to the empty state below, which explains why there is nothing to pick.
   */
  useEffect(() => {
    if (load.status !== 'ready' || load.locations.length !== 1) {
      return;
    }
    const only = load.locations[0]!;
    window.sessionStorage.setItem(CHECKOUT_LOCATION_KEY, only.id);
    const params = new URLSearchParams({ step: '2', locationId: only.id });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [load, pathname, router]);

  // The weekday key for the visitor's "today", used to surface today's hours.
  // `getDay()` is always 0–6, so the lookup always hits a key.
  const todayKey = useMemo(() => WEEKDAY_KEYS[new Date().getDay()]!, []);

  if (load.status === 'loading') {
    return <p {...stylex.props(styles.status)}>{t('locations.loading')}</p>;
  }

  if (load.status === 'error') {
    return (
      <div {...stylex.props(styles.centered)}>
        <p {...stylex.props(styles.centeredText)}>{t('locations.error')}</p>
        <Button
          variant="secondary"
          size="md"
          label={t('locations.retry')}
          onClick={() => setLoad((prev) => ({ ...prev, status: 'loading' }))}
        />
      </div>
    );
  }

  if (load.locations.length === 0) {
    return (
      <div {...stylex.props(styles.centered)}>
        <p {...stylex.props(styles.centeredTitle)}>{t('locations.empty.title')}</p>
        <p {...stylex.props(styles.centeredText)}>{t('locations.empty.subtitle')}</p>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.heading)}>
        <h2 {...stylex.props(styles.title)}>{t('locations.title')}</h2>
        <p {...stylex.props(styles.subtitle)}>{t('locations.subtitle')}</p>
      </div>

      <ul {...stylex.props(styles.grid)}>
        {load.locations.map((location) => (
          <LocationCard
            key={location.id}
            location={location}
            selected={location.id === selectedId}
            todayKey={todayKey}
            todayLabel={t('locations.todayHours')}
            closedLabel={t('locations.closed')}
            selectLabel={t('locations.select')}
            selectedLabel={t('locations.selected')}
            onSelect={() => select(location.id)}
          />
        ))}
      </ul>

      <div {...stylex.props(styles.actionsEnd)}>
        <Button
          variant="primary"
          size="md"
          label={t('continue')}
          isDisabled={!selectedId}
          onClick={onContinue}
        />
      </div>
    </div>
  );
}

/** A single selectable location card. */
function LocationCard({
  location,
  selected,
  todayKey,
  todayLabel,
  closedLabel,
  selectLabel,
  selectedLabel,
  onSelect,
}: {
  location: LocationSummary;
  selected: boolean;
  todayKey: string;
  todayLabel: string;
  closedLabel: string;
  selectLabel: string;
  selectedLabel: string;
  onSelect: () => void;
}) {
  const todayHours = location.hours[todayKey];

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        {...stylex.props(styles.card, selected ? styles.cardSelected : styles.cardIdle)}
      >
        <div {...stylex.props(styles.photo)}>
          {location.photoUrl ? (
            <Image
              src={location.photoUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              style={{ objectFit: 'cover' }}
            />
          ) : null}
        </div>

        <div {...stylex.props(styles.cardBody)}>
          <div {...stylex.props(styles.cardHead)}>
            <div style={{ minWidth: 0 }}>
              <p {...stylex.props(styles.name)}>{location.name}</p>
              {location.address ? (
                <p {...stylex.props(styles.address)}>{location.address}</p>
              ) : null}
            </div>
            <span {...stylex.props(styles.pill, selected ? styles.pillSelected : styles.pillIdle)}>
              {selected ? selectedLabel : selectLabel}
            </span>
          </div>

          {location.amenities.length > 0 ? (
            <ul {...stylex.props(styles.amenities)}>
              {location.amenities.map((amenity) => (
                <li key={amenity} {...stylex.props(styles.amenity)}>
                  {amenity}
                </li>
              ))}
            </ul>
          ) : null}

          <p {...stylex.props(styles.hours)}>
            {todayLabel}:{' '}
            <span {...stylex.props(styles.hoursValue)}>{todayHours ?? closedLabel}</span>
          </p>
        </div>
      </button>
    </li>
  );
}
