// @fit/admin — what a banner's row says about itself (T1.16).
//
// The member app shows a banner only when it is active AND has artwork AND the
// clock is inside its window (`GET /banners`, see `apps/api/src/banners`). Three
// independent conditions, so "why isn't this one on the phone?" has three
// different answers — and a console that rendered a bare on/off badge would
// answer none of them.
//
// So the console derives ONE label per row, naming the first reason the slide is
// not being drawn. Pure and separate from the view because that precedence is the
// only genuinely arguable thing on the screen, and it is worth a test rather than
// a comment.

import type { Banner } from '@fit/types';
import type { BadgeTone } from '@fit/ui-kit';

/**
 * The state a banner reads as in the console.
 *
 * `draft` — no artwork yet, so there is no slide to show. `off` — the manual
 * switch is down. `expired` / `scheduled` — the window has passed, or has not
 * opened. `live` — being drawn on the home screen right now.
 */
export type BannerStatus = 'draft' | 'off' | 'expired' | 'scheduled' | 'live';

/** The badge tone each state renders in. */
export const BANNER_STATUS_TONES: Record<BannerStatus, BadgeTone> = {
  draft: 'neutral',
  off: 'neutral',
  expired: 'pending',
  scheduled: 'pending',
  live: 'positive',
};

/**
 * The single state `banner` reads as at `now` (epoch ms).
 *
 * PRECEDENCE, most blocking first: no artwork beats everything (the row cannot
 * become a slide at all); then the manual switch, because that is a person's
 * decision and outranks the calendar's; then the window, past before future. Only
 * a banner that clears all four is `live`.
 *
 * `endsAt` is compared as "has passed" (`<= now`) and `startsAt` as "has not
 * arrived" (`> now`), which mirrors the API's own inclusive-start / exclusive-end
 * window so the console and the phone never disagree about a banner on its edge.
 */
export function bannerStatus(banner: Banner, now: number): BannerStatus {
  if (banner.imageUrl === '') {
    return 'draft';
  }
  if (!banner.isActive) {
    return 'off';
  }
  if (banner.endsAt !== null && new Date(banner.endsAt).getTime() <= now) {
    return 'expired';
  }
  if (banner.startsAt !== null && new Date(banner.startsAt).getTime() > now) {
    return 'scheduled';
  }
  return 'live';
}
