'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { LocationSummary } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchLocations } from '@/lib/locations';

/** sessionStorage key the wizard persists the chosen location under (T3.8). */
export const CHECKOUT_LOCATION_KEY = 'checkout_locationId';

/** Weekday keys the `hours` map is keyed by, indexed by `Date.getDay()` (0 = Sun). */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

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

  // The weekday key for the visitor's "today", used to surface today's hours.
  // `getDay()` is always 0–6, so the lookup always hits a key.
  const todayKey = useMemo(() => WEEKDAY_KEYS[new Date().getDay()]!, []);

  if (load.status === 'loading') {
    return <p className="py-16 text-center text-sm text-slate-400">{t('locations.loading')}</p>;
  }

  if (load.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-slate-500">{t('locations.error')}</p>
        <button
          type="button"
          onClick={() => setLoad((prev) => ({ ...prev, status: 'loading' }))}
          className="rounded-card border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {t('locations.retry')}
        </button>
      </div>
    );
  }

  if (load.locations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-sm font-medium text-slate-900">{t('locations.empty.title')}</p>
        <p className="text-sm text-slate-500">{t('locations.empty.subtitle')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">{t('locations.title')}</h2>
        <p className="text-sm text-slate-500">{t('locations.subtitle')}</p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
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

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!selectedId}
          onClick={onContinue}
          className="rounded-card bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {t('continue')}
        </button>
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
        className={`flex w-full flex-col overflow-hidden rounded-card border text-left transition-colors ${
          selected
            ? 'border-brand-600 ring-1 ring-brand-600'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <div className="relative aspect-[16/9] w-full bg-slate-100">
          {location.photoUrl ? (
            <Image
              src={location.photoUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-slate-900">{location.name}</span>
              {location.address ? (
                <span className="text-sm text-slate-500">{location.address}</span>
              ) : null}
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {selected ? selectedLabel : selectLabel}
            </span>
          </div>

          {location.amenities.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {location.amenities.map((amenity) => (
                <li
                  key={amenity}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                >
                  {amenity}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-sm text-slate-500">
            {todayLabel}:{' '}
            <span className="font-medium text-slate-700">{todayHours ?? closedLabel}</span>
          </p>
        </div>
      </button>
    </li>
  );
}
