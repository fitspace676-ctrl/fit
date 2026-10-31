import type { PlatformMessages } from '@fit/i18n/platform';
import { I } from '@/components/marketing/icons';
import { messageList, type MessageReader } from '@/lib/messages';

/* ────────────────────────────────────────────────────────────────────────
   "Built For" - audience data (single source of truth)
   This one file feeds BOTH:
     • the landing page's "Built for how you actually run" tabs (which read only
       eyebrow / headline / subline / stats / panelClassName), and
     • the dedicated per-audience pages at /built-for/<slug> + the nav dropdown.

   The copy lives in the `builtFor` area of the platform catalogue
   (`packages/i18n/locales/platform/<locale>/builtFor.json`, under `pages.<slug>`);
   this module keeps what is not text — the slug, the icons, the panel gradient —
   and `getBuiltFor(t)` joins the two into the same `AudiencePage` records the
   templates always rendered. Hero / footer CTA buttons are fixed in the page
   template (Book a demo and Request a call, the site's two lead forms), so
   they aren't stored here. Keep every `slug` unique.
   ──────────────────────────────────────────────────────────────────────── */

export type Stat = { value: string; label: string };

/** One marketed capability block - eyebrow, headline, body and supporting bullets. */
export type Feature = {
  /** Icon path key from the shared `I` set. */
  icon: string;
  eyebrow: string;
  headline: string;
  body: string;
  bullets: string[];
};

export type AudiencePage = {
  /** URL slug → /built-for/<slug>. Also used as the AnimatedTabs key (`value`). */
  slug: string;
  /** AnimatedTab key - kept equal to `slug`. */
  value: string;
  /** Plain audience name, e.g. "Fitness Clubs". */
  name: string;
  /** AnimatedTab label - kept equal to `name`. */
  title: string;
  /** Label shown in the "Built For" nav dropdown, e.g. "Fitness Clubs". */
  navLabel: string;
  /** Short uppercase eyebrow (no longer shown on the panels; the badge uses `name`). */
  eyebrow: string;
  /** Icon path key from the shared `I` set. */
  icon: string;
  /** Tailwind gradient stops for the hero panel background, all on the brand ramps. */
  panelClassName: string;
  headline: string;
  subline: string;
  /** One-line description, for the homepage capability cards (features only). */
  summary?: string;
  stats: Stat[];
  /** Short capability chips shown in place of the stat strip when `stats` is empty. */
  highlights?: string[];
  /** The marketed feature blocks, rendered as alternating rows. */
  features: Feature[];
  /** Optional "recommended plan" highlight band. */
  planRecommendation?: { eyebrow: string; headline: string; body: string };
  /** Closing CTA band copy. */
  footerCta: { headline: string; subline: string };
};

/** The audience copy as it sits in the catalogue, keyed by slug. */
type AudienceCopy = PlatformMessages['builtFor']['pages'];

/** A known audience slug — the keys of `builtFor.pages` in the catalogue. */
export type AudienceSlug = keyof AudienceCopy;

/** What is not copy: the slug, the icons and the panel gradient, in display order. */
type AudienceMeta = {
  slug: AudienceSlug;
  icon: string;
  panelClassName: string;
  /** One icon per feature block, in the order the blocks appear in the catalogue. */
  featureIcons: string[];
};

export const BUILT_FOR_META: readonly AudienceMeta[] = [
  {
    slug: 'fitness-clubs',
    icon: I.members,
    panelClassName: 'from-brand-600 via-brand-800 to-[#061634]',
    featureIcons: [I.members, I.bell, I.chart, I.phone, I.qr],
  },
  {
    slug: 'training-studios',
    icon: I.flame,
    panelClassName: 'from-iris-600 via-iris-800 to-[#061634]',
    featureIcons: [I.members, I.bell, I.chart, I.phone],
  },
  {
    slug: 'yoga-studios',
    icon: I.stretching,
    panelClassName: 'from-accent-600 via-brand-800 to-[#061634]',
    featureIcons: [I.members, I.bell, I.calendar, I.phone],
  },
  {
    slug: 'pilates-studios',
    icon: I.stretching2,
    panelClassName: 'from-brand-500 via-iris-800 to-[#061634]',
    featureIcons: [I.members, I.bell, I.qr, I.phone],
  },
  {
    slug: 'crossfit',
    icon: I.barbell,
    panelClassName: 'from-brand-600 via-brand-800 to-[#061634]',
    featureIcons: [I.members, I.calendar, I.bell, I.qr],
  },
  {
    slug: 'martial-arts',
    icon: I.karate,
    panelClassName: 'from-iris-600 via-iris-800 to-[#061634]',
    featureIcons: [I.members, I.bell, I.calendar, I.card],
  },
  {
    slug: 'swimming-schools',
    icon: I.swimming,
    panelClassName: 'from-accent-600 via-brand-800 to-[#061634]',
    featureIcons: [I.members, I.bell, I.calendar, I.card],
  },
  {
    slug: 'dance-schools',
    icon: I.vinyl,
    panelClassName: 'from-brand-500 via-iris-800 to-[#061634]',
    featureIcons: [I.members, I.bell, I.calendar, I.phone],
  },
  {
    slug: 'padel',
    icon: I.padel,
    panelClassName: 'from-brand-600 via-brand-800 to-[#061634]',
    featureIcons: [I.members, I.calendar, I.bell, I.pos],
  },
  {
    slug: 'tennis-clubs',
    icon: I.tennis,
    panelClassName: 'from-iris-600 via-iris-800 to-[#061634]',
    featureIcons: [I.members, I.bell, I.calendar, I.phone],
  },
];

/** Every audience slug, in display order - for `generateStaticParams`. */
export const BUILT_FOR_SLUGS: readonly AudienceSlug[] = BUILT_FOR_META.map((meta) => meta.slug);

export function isAudienceSlug(slug: string): slug is AudienceSlug {
  return (BUILT_FOR_SLUGS as readonly string[]).includes(slug);
}

function audienceFrom(meta: AudienceMeta, copy: AudienceCopy[AudienceSlug]): AudiencePage {
  return {
    slug: meta.slug,
    value: meta.slug,
    name: copy.name,
    title: copy.name,
    navLabel: copy.name,
    eyebrow: copy.name,
    icon: meta.icon,
    panelClassName: meta.panelClassName,
    headline: copy.headline,
    subline: copy.subline,
    stats: messageList(copy.stats),
    features: messageList(copy.features).map((feature, i) => ({
      icon: meta.featureIcons[i] ?? meta.icon,
      eyebrow: feature.eyebrow,
      headline: feature.headline,
      body: feature.body,
      bullets: messageList(feature.bullets),
    })),
    planRecommendation: copy.planRecommendation,
    footerCta: copy.footerCta,
  };
}

/**
 * Every audience, in display order, with its copy read from the `builtFor`
 * area: pass `useTranslations('builtFor')` or `getTranslations('builtFor')`.
 */
export function getBuiltFor(t: MessageReader): AudiencePage[] {
  const pages = t.raw('pages') as AudienceCopy;
  return BUILT_FOR_META.map((meta) => audienceFrom(meta, pages[meta.slug]));
}

/** Lookup by slug - used by the dynamic route. Same translator as {@link getBuiltFor}. */
export function getAudience(t: MessageReader, slug: string): AudiencePage | undefined {
  if (!isAudienceSlug(slug)) return undefined;
  const meta = BUILT_FOR_META.find((m) => m.slug === slug);
  if (!meta) return undefined;
  const pages = t.raw('pages') as AudienceCopy;
  return audienceFrom(meta, pages[slug]);
}
