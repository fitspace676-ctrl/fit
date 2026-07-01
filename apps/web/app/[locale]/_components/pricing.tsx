import { getTranslations } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { Card, Icon, buttonClasses } from '@/src/components/ui';

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
    <section id="pricing" className="scroll-mt-20 bg-ink-50 py-20 dark:bg-white/5">
      <div className="mx-auto max-w-6xl px-gutter">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 dark:text-white">
            {t('title')}
          </h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">{t('subtitle')}</p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map(({ key, popular }) => {
            const features = Object.values(
              t.raw(`plans.${key}.features`) as Record<string, string>,
            );
            return (
              <Card
                key={key}
                glow
                className={
                  popular
                    ? 'flex flex-col p-8 ring-2 ring-brand-500 dark:ring-brand-400'
                    : 'flex flex-col p-8'
                }
              >
                {popular && (
                  <span className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b-pill bg-[linear-gradient(135deg,#7C3AED,#EC4899)] px-3 py-1 text-xs font-semibold text-white shadow-[0_6px_24px_-6px_rgba(98,87,227,0.7)]">
                    {t('mostPopular')}
                  </span>
                )}
                <h3 className="text-lg font-semibold text-ink-900 dark:text-white">
                  {t(`plans.${key}.name`)}
                </h3>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                  {t(`plans.${key}.description`)}
                </p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-extrabold tracking-tight text-ink-900 dark:text-white">
                    {t(`plans.${key}.price`)}
                  </span>
                  <span className="text-sm text-ink-500 dark:text-ink-400">{t('perMonth')}</span>
                </p>
                <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-ink-600 dark:text-ink-300">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Icon
                        name="check"
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-300"
                        sw={2.4}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={buttonClasses(popular ? 'primary' : 'outline', 'md', 'mt-8 w-full')}
                >
                  {t(`plans.${key}.cta`)}
                </Link>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
