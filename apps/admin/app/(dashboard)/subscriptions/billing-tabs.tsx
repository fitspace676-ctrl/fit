// @fit/admin — the Billing section's sub-navigation.
//
// The reference design presents membership plans and PT packages as sibling
// tabs under one "Billing" page title. The two rosters live on separate routes
// (`/subscriptions`, `/packages`), so the "tabs" are plain links with the
// active one carrying the engine-gradient underline.

import Link from 'next/link';

/** The Billing sub-tabs — membership plans here, PT packages on `/packages`. */
const BILLING_TABS = [
  { label: 'Plans', href: '/subscriptions' },
  { label: 'PT packages', href: '/packages' },
] as const;

export type BillingTab = (typeof BILLING_TABS)[number]['label'];

/** The gradient-underlined tab bar rendered beneath the "Billing" page title. */
export function BillingTabs({ active }: { active: BillingTab }) {
  return (
    <div className="flex items-center gap-5 border-b border-ink-200 dark:border-white/10">
      {BILLING_TABS.map((tab) =>
        tab.label === active ? (
          <span
            key={tab.label}
            aria-current="page"
            className="relative pb-2.5 text-sm font-semibold text-ink-900 dark:text-white"
          >
            {tab.label}
            <span
              aria-hidden
              className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-[linear-gradient(135deg,#7C3AED,#EC4899)]"
            />
          </span>
        ) : (
          <Link
            key={tab.label}
            href={tab.href}
            className="pb-2.5 text-sm font-semibold text-ink-500 transition hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
          >
            {tab.label}
          </Link>
        ),
      )}
    </div>
  );
}
