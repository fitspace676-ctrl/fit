'use client';

import { useState } from 'react';
import { useActiveLocation, type ActiveLocationOption } from '@/components/active-location';

/**
 * The branch-exclusivity select the Stage 7 catalogue forms share — subscription
 * plans, PT packages, products, class types and promo codes.
 *
 * > **`null` means AVAILABLE AT EVERY BRANCH** (see `branchExclusivitySchema` in
 * > `@fit/types`). The empty option is a real answer here, not a missing one, which
 * > is where this differs from `MemberForm`'s home branch.
 */
export interface BranchExclusivity {
  /** The select's value: `''` for every branch, otherwise a location id. */
  value: string;
  setValue: (next: string) => void;
  /** The branches the switcher offers this operator. */
  locations: readonly ActiveLocationOption[];
  /**
   * The stored branch when the operator's switcher does not list it (a branch
   * outside their scope, or one since deactivated). Offered as its own option so
   * an unrelated edit saves the item's scope back unchanged instead of widening it.
   */
  unlistedId: string | null;
  /** The wire value — `null` for every branch, never `''` or the `'all'` sentinel. */
  locationId: string | null;
  /** False for a gym with no branches on file and nothing stored to show. */
  visible: boolean;
}

/**
 * Seed and hold a catalogue form's exclusive branch.
 *
 * A new item always starts on every branch, **whatever the header switcher is
 * scoped to**. Seeding it with the active branch — as `MemberForm` does for a home
 * branch — would make every new plan exclusive to whichever branch the operator
 * happened to be looking at. An edit shows what is stored.
 */
export function useBranchExclusivity(
  mode: 'create' | 'edit',
  stored: string | null | undefined,
): BranchExclusivity {
  const { locations } = useActiveLocation();
  const [value, setValue] = useState(mode === 'edit' ? (stored ?? '') : '');

  const unlistedId =
    mode === 'edit' && stored && !locations.some((location) => location.id === stored)
      ? stored
      : null;

  return {
    value,
    setValue,
    locations,
    unlistedId,
    locationId: value === '' ? null : value,
    visible: locations.length > 0 || unlistedId !== null,
  };
}
