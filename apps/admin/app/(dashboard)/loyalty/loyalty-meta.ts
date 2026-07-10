// @fit/admin — Loyalty UI helpers (T12.11).
//
// Shared, presentation-only constants + formatters for the Loyalty workspace:
// the reward-type → tone / icon map, the redemption-status tone map, and a
// couple of locale-aware formatters. Kept out of the client components so the
// program, rewards, redemptions and member-ledger surfaces render one vocabulary.

import type { LoyaltyRedemptionStatus, LoyaltyRewardType } from '@fit/types';
import type { IconName, Tone } from '@/components/ui';

/** The reward types in the order the pickers + breakdowns show them. */
export const REWARD_TYPE_ORDER: readonly LoyaltyRewardType[] = [
  'pt_session',
  'day_pass',
  'guest_pass',
  'merchandise',
  'drink',
  'discount',
  'other',
];

/** The badge tone each reward type renders in. */
export const REWARD_TYPE_TONES: Record<LoyaltyRewardType, Tone> = {
  pt_session: 'brand',
  day_pass: 'accent',
  guest_pass: 'iris',
  merchandise: 'success',
  drink: 'flame',
  discount: 'warning',
  other: 'ink',
};

/** The glyph the rewards list + redemptions use for each reward type. */
export const REWARD_TYPE_ICONS: Record<LoyaltyRewardType, IconName> = {
  pt_session: 'dumbbell',
  day_pass: 'ticket',
  guest_pass: 'users',
  merchandise: 'bag',
  drink: 'spark',
  discount: 'tag',
  other: 'award',
};

/** The badge tone each redemption status renders in. */
export const REDEMPTION_STATUS_TONES: Record<LoyaltyRedemptionStatus, Tone> = {
  pending: 'warning',
  fulfilled: 'success',
  cancelled: 'ink',
};

/** Format a whole-points figure with locale-aware grouping (e.g. `1,250`). */
export function formatPoints(points: number, locale: string): string {
  return points.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** A signed points delta as staff read it in the ledger (`+250` / `−100`). */
export function formatDelta(delta: number, locale: string): string {
  const sign = delta < 0 ? '−' : '+';
  return `${sign}${formatPoints(Math.abs(delta), locale)}`;
}

/** Format an ISO timestamp as a short, locale-aware date (blank when null). */
export function formatDate(iso: string | null, locale: string): string {
  if (!iso) {
    return '';
  }
  return new Date(iso).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format an ISO timestamp as a short, locale-aware date + time (blank when null). */
export function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) {
    return '';
  }
  return new Date(iso).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
