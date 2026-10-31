import type { PlatformMessages } from '@fit/i18n/platform';
import { I } from '@/components/marketing/icons';
import { messageList, type MessageReader } from '@/lib/messages';
import type { AudiencePage } from './built-for';

/* ────────────────────────────────────────────────────────────────────────
   "Features" - one page per product module (single source of truth)
   Feeds the "Features" nav dropdown, the homepage capability cards and the
   /features/<slug> pages (the /built-for template). Feature pages carry no stats:
   there are no measured figures to quote, so the hero shows `highlights`
   (what the module does) where an audience page shows its stat strip.

   The copy lives in the `features` area of the platform catalogue
   (`packages/i18n/locales/platform/<locale>/features.json`, under
   `modules.<slug>`); this module keeps the slug, the icons and the panel
   gradient, and `getFeatures(t)` joins the two.

   Every capability named here exists in the staff console (apps/admin), the
   member portal (apps/web), the mobile app (apps/mobile) or the AI agent
   (packages/agent). Keep it that way: describe the product, don't promise it.
   ──────────────────────────────────────────────────────────────────────── */

const PANELS = [
  'from-brand-600 via-brand-800 to-[#061634]',
  'from-iris-600 via-iris-800 to-[#061634]',
  'from-accent-600 via-brand-800 to-[#061634]',
  'from-brand-500 via-iris-800 to-[#061634]',
];

/** The module copy as it sits in the catalogue, keyed by slug. */
type FeatureCopy = PlatformMessages['features']['modules'];

/** A known feature slug — the keys of `features.modules` in the catalogue. */
export type FeatureSlug = keyof FeatureCopy;

type FeatureMeta = {
  slug: FeatureSlug;
  icon: string;
  /** One icon per feature block, in the order the blocks appear in the catalogue. */
  featureIcons: string[];
};

export const FEATURE_META: readonly FeatureMeta[] = [
  {
    slug: 'member-portal',
    icon: I.portal,
    featureIcons: [I.calendar, I.card, I.qr, I.spark],
  },
  {
    slug: 'booking-scheduling',
    icon: I.booking,
    featureIcons: [I.calendar, I.members, I.flame],
  },
  {
    slug: 'reception-pos',
    icon: I.terminal,
    featureIcons: [I.pos, I.qr, I.chart],
  },
  {
    slug: 'mobile-app',
    icon: I.app,
    featureIcons: [I.calendar, I.qr, I.card],
  },
  {
    slug: 'analytics-reporting',
    icon: I.trend,
    featureIcons: [I.chart, I.members, I.card],
  },
  {
    slug: 'ai-assistant',
    icon: I.sparkles,
    featureIcons: [I.spark, I.members, I.bell],
  },
];

/** Every feature slug, in display order - for `generateStaticParams`. */
export const FEATURE_SLUGS: readonly FeatureSlug[] = FEATURE_META.map((meta) => meta.slug);

export function isFeatureSlug(slug: string): slug is FeatureSlug {
  return (FEATURE_SLUGS as readonly string[]).includes(slug);
}

function featureFrom(
  meta: FeatureMeta,
  index: number,
  copy: FeatureCopy[FeatureSlug],
): AudiencePage {
  return {
    slug: meta.slug,
    value: meta.slug,
    name: copy.name,
    title: copy.name,
    navLabel: copy.name,
    eyebrow: copy.name,
    icon: meta.icon,
    panelClassName: PANELS[index % PANELS.length]!,
    headline: copy.headline,
    subline: copy.subline,
    summary: copy.summary,
    stats: [],
    highlights: messageList(copy.highlights),
    features: messageList(copy.features).map((feature, i) => ({
      icon: meta.featureIcons[i] ?? meta.icon,
      eyebrow: feature.eyebrow,
      headline: feature.headline,
      body: feature.body,
      bullets: messageList(feature.bullets),
    })),
    footerCta: copy.footerCta,
  };
}

/**
 * Every module, in display order, with its copy read from the `features`
 * area: pass `useTranslations('features')` or `getTranslations('features')`.
 */
export function getFeatures(t: MessageReader): AudiencePage[] {
  const modules = t.raw('modules') as FeatureCopy;
  return FEATURE_META.map((meta, index) => featureFrom(meta, index, modules[meta.slug]));
}

/** Lookup by slug - used by the dynamic route. Same translator as {@link getFeatures}. */
export function getFeature(t: MessageReader, slug: string): AudiencePage | undefined {
  if (!isFeatureSlug(slug)) return undefined;
  const index = FEATURE_META.findIndex((m) => m.slug === slug);
  const meta = FEATURE_META[index];
  if (!meta) return undefined;
  const modules = t.raw('modules') as FeatureCopy;
  return featureFrom(meta, index, modules[slug]);
}
