import { getTranslations } from 'next-intl/server';
import { Card, Icon, type IconName } from '@/src/components/ui';

/**
 * The feature cards, in display order. Each `key` maps to a `home.features.items.<key>`
 * entry in the message catalogue (title + description); the `icon` is a name from
 * the shared formacore `Icon` set so the marketing page shares the member portal's
 * iconography.
 */
const FEATURES: { key: string; icon: IconName }[] = [
  { key: 'discover', icon: 'pin' },
  { key: 'book', icon: 'calendar' },
  { key: 'train', icon: 'dumbbell' },
  { key: 'membership', icon: 'card' },
];

/**
 * Features grid — four value props for the product. Card copy is localized via
 * `home.features.items.<key>`; the cards and their icons are driven by the
 * {@link FEATURES} list so the catalogue stays the single source of truth for
 * text while icons live in code.
 */
export async function Features() {
  const t = await getTranslations('home.features');

  return (
    <section className="mx-auto max-w-6xl px-gutter py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 dark:text-white">
          {t('title')}
        </h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300">{t('subtitle')}</p>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <Card key={feature.key} glow className="p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <Icon name={feature.icon} className="h-6 w-6" sw={2} />
            </span>
            <h3 className="mt-4 text-base font-semibold text-ink-900 dark:text-white">
              {t(`items.${feature.key}.title`)}
            </h3>
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
              {t(`items.${feature.key}.description`)}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
