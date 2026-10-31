import type { PlatformMessages } from '@fit/i18n/platform';
import { messageList, type MessageReader } from '@/lib/messages';

/* ────────────────────────────────────────────────────────────────────────
   Feature page copy (the /features/<slug> long-form pages)
   One record per feature, written by FormaCore. The design template reads
   only this shape, so a new feature is a new record in the catalogue
   (`features.pages.<slug>` in packages/i18n/locales/platform/<locale>/features.json)
   plus its hero image and plan list below.
   ──────────────────────────────────────────────────────────────────────── */

export type FeatureBlock = {
  title: string;
  headline: string;
  body: string;
  bullets: string[];
};

export type FeaturePageCopy = {
  slug: string;
  eyebrow: string;
  /** Hero photo in /public, shown under a brand-colour overlay. */
  heroImage: string;
  headline: string;
  subline: string;
  intro: { headline: string; body: string };
  blocks: FeatureBlock[];
  plans?: ('Studio' | 'Club' | 'Core')[];
  plan: { eyebrow: string; headline: string; body: string };
  footerCta: { headline: string; subline: string };
};

/** The page copy as it sits in the catalogue, keyed by slug. */
type PageCopy = PlatformMessages['features']['pages'];

/** A feature that has a long-form page — the keys of `features.pages` in the catalogue. */
export type FeaturePageSlug = keyof PageCopy;

type FeaturePageMeta = {
  slug: FeaturePageSlug;
  heroImage: string;
  plans: ('Studio' | 'Club' | 'Core')[];
};

export const FEATURE_PAGE_META: readonly FeaturePageMeta[] = [
  {
    slug: 'member-portal',
    heroImage: '/features/member-portal-hero.webp',
    plans: ['Club', 'Core'],
  },
  {
    slug: 'booking-scheduling',
    heroImage: '/features/booking-scheduling-hero.webp',
    plans: ['Club', 'Core'],
  },
  {
    slug: 'reception-pos',
    heroImage: '/features/reception-pos-hero.webp',
    plans: ['Studio', 'Club', 'Core'],
  },
  {
    slug: 'mobile-app',
    heroImage: '/features/mobile-app-hero.webp',
    plans: ['Club', 'Core'],
  },
  {
    slug: 'analytics-reporting',
    heroImage: '/features/analytics-reporting-hero.webp',
    plans: ['Studio', 'Club', 'Core'],
  },
  {
    slug: 'ai-assistant',
    heroImage: '/features/ai-assistant-hero.webp',
    plans: ['Core'],
  },
];

function isFeaturePageSlug(slug: string): slug is FeaturePageSlug {
  return FEATURE_PAGE_META.some((meta) => meta.slug === slug);
}

/**
 * The long-form copy of one feature page, read from the `features` area:
 * pass `useTranslations('features')` or `getTranslations('features')`.
 */
export function getFeaturePage(t: MessageReader, slug: string): FeaturePageCopy | undefined {
  if (!isFeaturePageSlug(slug)) return undefined;
  const meta = FEATURE_PAGE_META.find((m) => m.slug === slug);
  if (!meta) return undefined;
  const pages = t.raw('pages') as PageCopy;
  const copy = pages[slug];
  return {
    slug: meta.slug,
    plans: meta.plans,
    eyebrow: copy.eyebrow,
    heroImage: meta.heroImage,
    headline: copy.headline,
    subline: copy.subline,
    intro: copy.intro,
    blocks: messageList(copy.blocks).map((block) => ({
      title: block.title,
      headline: block.headline,
      body: block.body,
      bullets: messageList(block.bullets),
    })),
    plan: copy.plan,
    footerCta: copy.footerCta,
  };
}
