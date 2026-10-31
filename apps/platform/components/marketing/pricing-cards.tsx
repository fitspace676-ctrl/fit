'use client';

import { useTranslations } from 'next-intl';
import type { PlatformMessages } from '@fit/i18n/platform';
import { useLeadCta } from './lead-cta-context';
import { Btn, I, Icon } from './marketing-ui';
import { GradientBorder } from '@/components/ui/gradient-border';
import { messageList, type MessageReader } from '@/lib/messages';
import { SHOW_PUBLIC_PRICING } from '@/lib/pricing-visibility';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore - pricing tier cards (shared)
   The three Studio / Club / Core plan cards, extracted so both the /pricing
   page and the marketing homepage render the exact same source. The middle
   (highlighted) tier carries the animated gradient border + brand mark; the
   others are plain glass cards. All stretch to equal height.

   While `SHOW_PUBLIC_PRICING` is off the cards are unchanged apart from the
   figure: the amount row goes. Every card closes on "Book a demo".

   The copy (name, tagline, billing note, feature list, badge) lives in the
   `pricing.tiers.<id>` area of the platform catalogue; the figures, tones and
   button looks stay here in `TIER_META`, and `getTiers(t)` joins the two.
   ──────────────────────────────────────────────────────────────────────── */

export interface Tier {
  id: string;
  name: string;
  tone: string;
  tagline: string;
  /** Monthly price in GEL (₾). Only printed while {@link SHOW_PUBLIC_PRICING}. */
  monthly: number;
  pricePrefix?: string;
  billingNote: string;
  features: string[];
  /** Look of the tier's "Book a demo" button: the featured tier gets the solid one. */
  ctaVariant: 'primary' | 'glassGradient';
  highlight?: boolean;
  badge?: string;
}

type TierCopy = PlatformMessages['pricing']['tiers'];
export type TierId = keyof TierCopy;

type TierMeta = {
  id: TierId;
  tone: string;
  monthly: number;
  ctaVariant: Tier['ctaVariant'];
  highlight?: boolean;
};

export const TIER_META: readonly TierMeta[] = [
  { id: 'studio', tone: 'iris', monthly: 219, ctaVariant: 'glassGradient' },
  { id: 'club', tone: 'brand', monthly: 449, ctaVariant: 'primary', highlight: true },
  { id: 'core', tone: 'accent', monthly: 649, ctaVariant: 'glassGradient' },
];

/**
 * The three tiers, in order, with their copy read from the `pricing` area:
 * pass `useTranslations('pricing')` or `getTranslations('pricing')`.
 */
export function getTiers(t: MessageReader): Tier[] {
  const copy = t.raw('tiers') as TierCopy;
  return TIER_META.map((meta) => {
    const tier = copy[meta.id];
    return {
      id: meta.id,
      name: tier.name,
      tone: meta.tone,
      tagline: tier.tagline,
      monthly: meta.monthly,
      ...('pricePrefix' in tier ? { pricePrefix: tier.pricePrefix } : {}),
      billingNote: tier.billingNote,
      features: messageList(tier.features),
      ctaVariant: meta.ctaVariant,
      ...(meta.highlight ? { highlight: true } : {}),
      ...('badge' in tier ? { badge: tier.badge } : {}),
    };
  });
}

/** The three-up plan card grid on desktop; a swipeable snap-carousel on mobile. */
export const PricingCards = () => {
  const t = useTranslations('pricing');
  const tCommon = useTranslations('common');
  const tiers = getTiers(t);
  // Opens the shared "Book a demo" / "Request a call" forms.
  const openLead = useLeadCta();

  return (
    <div className="flex snap-x snap-mandatory items-stretch gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
      {tiers.map((tier) => {
        const body = (
          <div className="relative flex h-full flex-col rounded-[inherit] bg-panel p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">{tier.name}</h2>
              {tier.badge && (
                // Brand-gradient pill with a soft glow and a light sweep across it.
                <span className="relative inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-pill bg-[radial-gradient(ellipse_at_top_left,rgba(127,179,200,0.9),transparent_60%),linear-gradient(120deg,#2F7896_15%,#1F4A72_100%)] py-1 pl-2 pr-3 text-[11px] font-semibold tracking-wide text-white shadow-[0_6px_18px_-6px_rgba(31,74,114,0.8)] ring-1 ring-inset ring-white/25">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent motion-safe:animate-[badge-shine_3.2s_ease-in-out_infinite]"
                  />
                  <svg aria-hidden viewBox="0 0 24 24" className="relative h-3 w-3 fill-current">
                    <path d="M12 1.5c.5 4.9 2.6 8 9 10.5-6.4 2.5-8.5 5.6-9 10.5-.5-4.9-2.6-8-9-10.5 6.4-2.5 8.5-5.6 9-10.5Z" />
                  </svg>
                  <span className="relative">{tier.badge}</span>
                </span>
              )}
            </div>
            <p className="text-sm text-faint mt-1.5 leading-relaxed min-h-[2.5rem]">
              {tier.tagline}
            </p>

            {SHOW_PUBLIC_PRICING && (
              <div className="flex items-baseline gap-1.5 mt-6">
                {tier.pricePrefix && (
                  <span className="text-sm font-semibold text-subtle">{tier.pricePrefix}</span>
                )}
                {/* The buttons' teal-to-navy gradient, lifted a step in dark mode so
                    the figure keeps its contrast on the dark card. */}
                <span className="font-display text-[2.75rem] font-black tracking-tight tabular-nums leading-none bg-[linear-gradient(120deg,#5E9DB6_0%,#2F7896_40%,#1F4A72_100%)] dark:bg-[linear-gradient(120deg,#DEEDF2_0%,#9AC4D4_45%,#5E9DB6_100%)] text-transparent [-webkit-background-clip:text] [background-clip:text]">
                  ₾{tier.monthly.toLocaleString('en-US')}
                </span>
                <span className="text-sm font-semibold text-subtle">{t('cards.perMonth')}</span>
              </div>
            )}
            <p
              className={`font-mono text-[11px] text-subtle h-4 ${SHOW_PUBLIC_PRICING ? 'mt-2' : 'mt-6'}`}
            >
              {tier.billingNote}
            </p>

            <ul className="mt-6 grow space-y-3 border-t border-overlay/10 pt-6">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={`shrink-0 mt-0.5 w-5 h-5 rounded-full grid place-items-center bg-${tier.tone}-500/15 ring-1 ring-inset ring-${tier.tone}-500/25`}
                  >
                    <Icon
                      d={I.check}
                      c={`w-3 h-3 text-${tier.tone}-700 dark:text-${tier.tone}-300`}
                      sw={3}
                    />
                  </span>
                  <span className="text-strong">{f}</span>
                </li>
              ))}
            </ul>

            {/* The buttons close every card. `grow` on the list above absorbs
                  the slack, so they line up across tiers of different lengths. */}
            <div className="mt-6 space-y-2.5 border-t border-overlay/10 pt-6">
              <Btn
                v={tier.ctaVariant}
                size="md"
                full
                icon={I.arrow}
                onClick={() => openLead('demo')}
              >
                {tCommon('cta.bookDemo')}
              </Btn>
            </div>
          </div>
        );

        return tier.highlight ? (
          <GradientBorder
            key={tier.id}
            className="w-[82%] shrink-0 self-stretch snap-start rounded-[1.5rem] shadow-[0_40px_100px_-40px_rgba(26,127,214,0.6)] sm:w-[60%] lg:w-auto lg:-translate-y-3"
          >
            {body}
          </GradientBorder>
        ) : (
          <div
            key={tier.id}
            className="relative w-[82%] shrink-0 self-stretch snap-start overflow-hidden rounded-[1.5rem] ring-1 ring-inset ring-overlay/10 transition hover:ring-overlay/20 shadow-[0_18px_60px_-28px_rgba(16,18,33,0.45)] sm:w-[60%] lg:w-auto"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
};

export default PricingCards;
