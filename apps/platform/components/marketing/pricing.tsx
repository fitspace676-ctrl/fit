import Link from 'next/link';

/** A single pricing tier card. `featured` lifts the recommended plan visually. */
interface Tier {
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  featured: boolean;
}

/**
 * The pricing tiers, in display order. Placeholder figures until billing lands —
 * the marketing surface needs a credible pricing section now, and the numbers
 * are trivially editable here when the real plans are set.
 */
const TIERS: Tier[] = [
  {
    name: 'Starter',
    price: 'Free',
    cadence: 'for your first 50 members',
    description: 'Everything you need to get your gym online and taking bookings.',
    features: [
      'Branded member site',
      'Class booking & waitlists',
      'Up to 50 members',
      'Email support',
    ],
    featured: false,
  },
  {
    name: 'Growth',
    price: '₾99',
    cadence: 'per month',
    description: 'For established gyms that need payments and unlimited reach.',
    features: [
      'Everything in Starter',
      'Card payments & packages',
      'Unlimited members',
      'Trainer scheduling',
      'Priority support',
    ],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: "Let's talk",
    cadence: 'custom pricing',
    description: 'Multi-location chains with bespoke onboarding and SLAs.',
    features: ['Everything in Growth', 'Multiple locations', 'Dedicated onboarding', 'Custom SLA'],
    featured: false,
  },
];

/** Inline check icon for the per-tier feature lists. */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Pricing section — three tiers with a highlighted recommended plan. Every CTA
 * funnels into the owner-signup flow (`/register-gym`); the enterprise tier
 * shares the same entry point for now.
 */
export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-slate-50">
      <div className="mx-auto max-w-6xl px-gutter py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Simple pricing that grows with you
          </h2>
          <p className="mt-3 text-slate-600">
            Start free and upgrade when you&apos;re ready. No setup fees, cancel anytime.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-card border bg-white p-8 ${
                tier.featured
                  ? 'border-brand-200 shadow-md ring-1 ring-brand-100'
                  : 'border-slate-100 shadow-sm'
              }`}
            >
              {tier.featured ? (
                <span className="mb-4 inline-flex w-fit rounded-card bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
                  Most popular
                </span>
              ) : null}
              <h3 className="text-lg font-semibold text-slate-900">{tier.name}</h3>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight text-slate-900">
                  {tier.price}
                </span>
                <span className="text-sm text-slate-500">{tier.cadence}</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{tier.description}</p>
              <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-slate-600">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/register-gym"
                className={`mt-8 rounded-card px-6 py-3 text-center text-sm font-semibold transition-colors ${
                  tier.featured
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'border border-slate-200 text-slate-700 hover:border-brand-300 hover:text-brand-600'
                }`}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
