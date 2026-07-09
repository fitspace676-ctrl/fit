// @fit/admin — Marketing UI helpers (T12.8).
//
// Shared, presentation-only constants + formatters for the Campaigns and
// Templates surfaces: the channel → icon / tone map, the campaign-status tone
// map, and a couple of locale-aware formatters. Kept out of the client
// components so the wizard, list, and template gallery render one vocabulary.

import type { CampaignStatus, MarketingChannel } from '@fit/types';
import type { IconName } from '@/components/ui';
import type { Tone } from '@/components/ui';

/** The channel each campaign/template targets, in the order the pickers show them. */
export const CHANNEL_ORDER: readonly MarketingChannel[] = ['email', 'sms', 'push'];

/** The glyph the composer + list use for each channel. */
export const CHANNEL_ICONS: Record<MarketingChannel, IconName> = {
  email: 'mail',
  sms: 'message',
  push: 'bell',
};

/** The badge tone each channel renders in. */
export const CHANNEL_TONES: Record<MarketingChannel, Tone> = {
  email: 'accent',
  sms: 'iris',
  push: 'flame',
};

/** The badge tone each lifecycle state renders in (all five API statuses). */
export const STATUS_TONES: Record<CampaignStatus, Tone> = {
  draft: 'ink',
  scheduled: 'warning',
  sent: 'success',
  paused: 'flame',
  active: 'brand',
};

/**
 * Content-length ceilings the composer enforces per channel (SMS + push are
 * hard-capped; email is free-form). Mirrors the prototype's per-channel limits.
 */
export const CHANNEL_BODY_LIMITS: Record<MarketingChannel, number | null> = {
  email: null,
  sms: 160,
  push: 100,
};

/** Push titles are short; email/SMS subjects use the schema's 200-char ceiling. */
export const CHANNEL_SUBJECT_LIMITS: Record<MarketingChannel, number> = {
  email: 200,
  sms: 100,
  push: 50,
};

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

/** Round a MINOR-unit amount to whole major units for a "minimum spend" input. */
export function minorToMajor(minor: number): number {
  return Math.round(minor / 100);
}

/** Convert a whole major-unit amount to MINOR units for the audience criteria. */
export function majorToMinor(major: number): number {
  return Math.round(major * 100);
}
