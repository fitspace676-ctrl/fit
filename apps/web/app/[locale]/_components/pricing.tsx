import { getTranslations } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';

/**
 * The plans, in display order. Each `key` maps to a `home.pricing.plans.<key>`
 * entry (name / price / description / cta / features). The middle plan is
 * flagged `popular` so it gets the brand emphasis and a "Most popular" badge.
 */
const PLANS: { key: string; popular: boolean }[] = [
  { key: 'starter', popular: false },
  { key: 'pro', popular: true },
  { key: 'studio', popular: false },
];

/**
 * Pricing section — three plans (Starter / Pro / Studio) localized via
 * `home.pricing.plans.<key>`. Per-plan feature bullets are stored as a keyed
 * object in the catalogue (next-intl messages can't be arrays) and read back
 * as their ordered values. Prices and copy live in the message catalogue so
 * both locales stay in sync.
 */
export async function Pricing() {
  const t = await getTranslations('home.pricing');

  return (
    <section id="pricing" className="scroll-mt-20 bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-gutter">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">{t('title')}</h2>
          <p className="mt-3 text-slate-600">{t('subtitle')}</p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map(({ key, popular }) => {
            const features = Object.values(
              t.raw(`plans.${key}.features`) as Record<string, string>,
            );
            return (
              <div
                key={key}
                className={
                  popular
                    ? 'relative flex flex-col rounded-card border-2 border-brand-600 bg-white p-8 shadow-md'
                    : 'relative flex flex-col rounded-card border border-slate-200 bg-white p-8'
                }
              >
                {popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-card bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                    {t('mostPopular')}
                  </span>
                )}
                <h3 className="text-lg font-semibold text-slate-900">{t(`plans.${key}.name`)}</h3>
                <p className="mt-1 text-sm text-slate-600">{t(`plans.${key}.description`)}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">
                    {t(`plans.${key}.price`)}
                  </span>
                  <span className="text-sm text-slate-500">{t('perMonth')}</span>
                </p>
                <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-slate-600">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={
                    popular
                      ? 'mt-8 rounded-card bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700'
                      : 'mt-8 rounded-card border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-600'
                  }
                >
                  {t(`plans.${key}.cta`)}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
