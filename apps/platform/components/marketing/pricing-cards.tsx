import { Btn, I, Icon, SIGNUP_HREF } from './marketing-ui';
import { GradientBorder } from '@/components/ui/gradient-border';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore - pricing tier cards (shared)
   The three Starter / Growth / Pro plan cards, extracted so both the /pricing
   page and the marketing homepage render the exact same source. The middle
   (highlighted) tier carries the animated gradient border + brand mark; the
   others are plain glass cards. All stretch to equal height.
   ──────────────────────────────────────────────────────────────────────── */

export interface Tier {
  id: string;
  name: string;
  tone: string;
  tagline: string;
  /** Monthly price in GEL (₾). */
  monthly: number;
  features: string[];
  cta: string;
  /** When set, the CTA links here (e.g. sales) instead of the signup flow. */
  ctaHref?: string;
  ctaVariant: 'primary' | 'glassGradient';
  highlight?: boolean;
  badge?: string;
}

export const tiers: Tier[] = [
  {
    id: 'starter',
    name: 'Starter',
    tone: 'iris',
    tagline: 'The complete foundation for running your location day to day.',
    monthly: 179,
    features: [
      'Point of Sale',
      'Member Management',
      'Class Scheduling & Personal Training Booking',
      'Inventory Management',
      'Offline Payment Processing',
      'Manual Check-in',
      'Staff Management',
      'Automation Center (pre-built templates)',
      'Analytics Dashboard',
    ],
    cta: 'Start free trial',
    ctaVariant: 'glassGradient',
  },
  {
    id: 'growth',
    name: 'Growth',
    tone: 'brand',
    tagline: 'Everything in Starter, plus the tools your members interact with directly.',
    monthly: 319,
    features: [
      'Branded Member Portal',
      'White-label Mobile App (iOS & Android)',
      'Self-service Check-in (QR code via app)',
      'Online & Recurring Payments',
      'Standard Reports',
    ],
    cta: 'Start free trial',
    ctaVariant: 'primary',
    highlight: true,
    badge: 'Most popular',
  },
  {
    id: 'pro',
    name: 'Pro',
    tone: 'accent',
    tagline: 'Everything in Growth, plus deeper intelligence and control for serious operators.',
    monthly: 449,
    features: [
      'AI Assistant',
      'API Access & Webhooks',
      'Advanced Automation (custom flows)',
      'AI-powered Reporting & Analytics',
      'Named Support Contact',
      'Custom Roles & Permissions',
    ],
    cta: 'Start free trial',
    ctaVariant: 'glassGradient',
  },
];

/** The three-up plan card grid on desktop; a swipeable snap-carousel on mobile. */
export const PricingCards = () => (
  <div className="flex snap-x snap-mandatory items-stretch gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
    {tiers.map((tier) => {
      const body = (
        <div className="relative flex h-full flex-col rounded-[inherit] bg-panel p-7">
          <div className="flex items-center justify-between">
            {tier.highlight ? (
              // The featured tier carries the FormaCore brand mark (favicon).
              <img
                src="/favicon.png"
                alt="FormaCore"
                className="h-11 w-11 rounded-btn object-contain"
              />
            ) : (
              <span
                className={`w-11 h-11 rounded-btn grid place-items-center bg-gradient-to-br from-${tier.tone}-400/30 to-${tier.tone}-600/15 ring-1 ring-inset ring-overlay/10`}
              >
                <Icon
                  d={I.bolt}
                  c={`w-[22px] h-[22px] text-${tier.tone}-700 dark:text-${tier.tone}-300`}
                  sw={2.2}
                />
              </span>
            )}
            {tier.badge && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-brand-500/15 ring-1 ring-inset ring-brand-500/25 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                <Icon d={I.star} c="w-3 h-3" sw={2.2} />
                {tier.badge}
              </span>
            )}
          </div>

          <h2 className="font-display text-2xl font-extrabold tracking-tight mt-5">{tier.name}</h2>
          <p className="text-sm text-faint mt-1.5 leading-relaxed min-h-[2.5rem]">{tier.tagline}</p>

          <div className="flex items-baseline gap-1.5 mt-6">
            <span className="font-display text-[2.75rem] font-black tracking-tight tabular-nums leading-none">
              ₾{tier.monthly.toLocaleString('en-US')}
            </span>
            <span className="text-sm font-semibold text-subtle">/mo</span>
          </div>
          <p className="font-mono text-[11px] text-subtle mt-2 h-4">
            billed monthly · cancel any time
          </p>

          <div className="mt-6">
            <Btn
              v={tier.ctaVariant}
              size="md"
              full
              icon={I.arrow}
              href={tier.ctaHref ?? SIGNUP_HREF}
            >
              {tier.cta}
            </Btn>
          </div>

          <ul className="mt-6 space-y-3 border-t border-overlay/10 pt-6">
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
        </div>
      );

      return tier.highlight ? (
        <GradientBorder
          key={tier.id}
          className="h-full w-[82%] shrink-0 snap-start rounded-[1.5rem] shadow-[0_40px_100px_-40px_rgba(124,58,237,0.6)] sm:w-[60%] lg:w-auto lg:-translate-y-3"
        >
          {body}
        </GradientBorder>
      ) : (
        <div
          key={tier.id}
          className="relative h-full w-[82%] shrink-0 snap-start overflow-hidden rounded-[1.5rem] ring-1 ring-inset ring-overlay/10 transition hover:ring-overlay/20 shadow-[0_18px_60px_-28px_rgba(16,18,33,0.45)] sm:w-[60%] lg:w-auto"
        >
          {body}
        </div>
      );
    })}
  </div>
);

export default PricingCards;
