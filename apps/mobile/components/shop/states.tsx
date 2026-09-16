// @fit/mobile — the shop stack's shared §6 states.
//
// Plan §6 asks every screen for loading, empty, ERROR WITH A WORKING RETRY,
// offline and a signed-out branch. Four shop screens need the same three
// shapes, so they live here once rather than four times with four slightly
// different skeleton heights.
//
// ===========================================================================
// THE RETRY IS AN INVALIDATION, NOT A `.refetch()`.
//
// WP-7's rule is absolute: "No screen may call `.refetch()`." The deleted app
// called it from ~a dozen ad-hoc call sites and the set of what actually went
// stale drifted from what the server had changed. `useRetry` takes the SAME key
// the query is registered under — from `lib/query-keys.ts`, the one factory —
// and invalidates it, which refetches every observer of that resource rather
// than the one hook that happened to be holding the button.
// ===========================================================================
//
// `EmptyState` IS the error state (WP-8b, plan item G-05): no artboard draws a
// failed load, a toast is never one because it auto-dismisses, and there is no
// warning-triangle glyph in the 60-icon dictionary — so `icon="info"` plus a
// retry `action` is the shipped shape.

import { EmptyState, Skeleton, Surface, spacing } from '@fit/ui-mobile';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback } from 'react';
import { View } from 'react-native';

/**
 * A retry that re-reads one resource.
 *
 * `null` for the key — which is what `queryKeys.*(gymId)` cannot be built
 * without a gym — yields a callback that invalidates nothing, because there is
 * no query to retry: the hook is disabled and the screen is rendering its
 * signed-out branch instead.
 */
export function useRetry(queryKey: QueryKey | null): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (queryKey === null) return;
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);
}

export interface LoadFailedProps {
  /** The sentence — `member.shop.error`, `member.shop.order.error`. */
  title: string;
  /** The retry button's label AND its accessible name — `member.shop.retry`. */
  retryLabel: string;
  onRetry: () => void;
  testID: string;
}

/** Plan §6 item 3 — a failed load, with a button that actually re-reads it. */
export function LoadFailed({ title, retryLabel, onRetry, testID }: LoadFailedProps) {
  return (
    <EmptyState
      testID={testID}
      icon="info"
      title={title}
      action={{ label: retryLabel, onPress: onRetry, testID: `${testID}-retry` }}
    />
  );
}

export interface RowSkeletonsProps {
  /**
   * ONE announcement for the whole placeholder block — `member.shop.loading`.
   * Per `Skeleton`'s own note, a loading list made of eighteen bars should say
   * "loading" once, not eighteen times.
   */
  label: string;
  /** How many rows. Default 4 — enough to fill the fold, not so many that the
   *  first real frame is a jump. */
  count?: number;
  /** `catalogue` rows are 72pt tall inside a 26-radius card; `line` rows are 56. */
  layout?: 'catalogue' | 'line';
  testID: string;
}

/** Product-shaped placeholders, matching `ProductRow`'s two shop layouts. */
export function RowSkeletons({
  label,
  count = 4,
  layout = 'catalogue',
  testID,
}: RowSkeletonsProps) {
  const thumb = layout === 'catalogue' ? 72 : 56;
  const rows = Array.from({ length: count }, (_, index) => index);

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      // The block announces itself; the bars inside it must not, or VoiceOver
      // stops on every one of them and says nothing.
      accessibilityElementsHidden={false}
      style={{ gap: spacing[3] }}
    >
      {rows.map((index) =>
        layout === 'catalogue' ? (
          <Surface key={index} tone="card" padding={4}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
              <Skeleton width={thumb} height={thumb} radius={22} animated={index === 0} />
              <View style={{ flex: 1, gap: spacing[2] }}>
                <Skeleton width="70%" height={15} animated={false} />
                <Skeleton width="45%" height={12} animated={false} />
                <Skeleton width="35%" height={15} animated={false} />
              </View>
            </View>
          </Surface>
        ) : (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <Skeleton width={thumb} height={thumb} radius={18} animated={index === 0} />
            <View style={{ flex: 1, gap: spacing[2] }}>
              <Skeleton width="65%" height={14} animated={false} />
              <Skeleton width="40%" height={12} animated={false} />
            </View>
          </View>
        ),
      )}
    </View>
  );
}
