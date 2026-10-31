// @fit/i18n/platform — the marketing site's (apps/platform) message catalogues.
//
// Kept apart from `./index`'s `messages` on purpose: the marketing copy is
// several hundred keys of long-form prose nobody else renders, and the platform
// site in turn needs none of the member/admin catalogues. Each area is its own
// JSON file under `locales/platform/<locale>/`, merged here into one object per
// locale so next-intl gets a single `messages` value.
//
// The English files are the source; `platform-parity.spec.ts` asserts the
// Georgian files carry exactly the same keys with no blank values.

import type { Locale } from './index';
import enBuiltFor from './locales/platform/en/builtFor.json';
import enCommon from './locales/platform/en/common.json';
import enFeatures from './locales/platform/en/features.json';
import enLanding from './locales/platform/en/landing.json';
import enLegal from './locales/platform/en/legal.json';
import enPricing from './locales/platform/en/pricing.json';
import enSignup from './locales/platform/en/signup.json';
import enTour from './locales/platform/en/tour.json';
import kaBuiltFor from './locales/platform/ka/builtFor.json';
import kaCommon from './locales/platform/ka/common.json';
import kaFeatures from './locales/platform/ka/features.json';
import kaLanding from './locales/platform/ka/landing.json';
import kaLegal from './locales/platform/ka/legal.json';
import kaPricing from './locales/platform/ka/pricing.json';
import kaSignup from './locales/platform/ka/signup.json';
import kaTour from './locales/platform/ka/tour.json';

/** The areas (top-level namespaces) of the platform catalogue, one JSON file each. */
export const platformAreas = [
  'common',
  'landing',
  'tour',
  'pricing',
  'signup',
  'builtFor',
  'features',
  'legal',
] as const;

/** A top-level namespace of the platform catalogue. */
export type PlatformArea = (typeof platformAreas)[number];

/** The English platform catalogue — the source the Georgian one mirrors. */
export const platformEn = {
  common: enCommon,
  landing: enLanding,
  tour: enTour,
  pricing: enPricing,
  signup: enSignup,
  builtFor: enBuiltFor,
  features: enFeatures,
  legal: enLegal,
};

/** Shape of one locale's platform catalogue (derived from the EN source). */
export type PlatformMessages = typeof platformEn;

/**
 * The Georgian platform catalogue. Typing it as {@link PlatformMessages}
 * fails to compile as soon as a key is missing or an extra one is added on the
 * Georgian side — the same early signal `member.ts` relies on.
 */
export const platformKa: PlatformMessages = {
  common: kaCommon,
  landing: kaLanding,
  tour: kaTour,
  pricing: kaPricing,
  signup: kaSignup,
  builtFor: kaBuiltFor,
  features: kaFeatures,
  legal: kaLegal,
};

/** Platform message catalogues keyed by locale — next-intl's `messages` for apps/platform. */
export const platformMessages: Record<Locale, PlatformMessages> = {
  en: platformEn,
  ka: platformKa,
};
