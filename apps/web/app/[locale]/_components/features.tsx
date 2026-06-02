import type { ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';

/**
 * The feature cards, in display order. Each `key` maps to a `home.features.items.<key>`
 * entry in the message catalogue (title + description); the `icon` is an inline
 * SVG path so the marketing page ships no icon-library dependency to the client.
 * `currentColor` lets each icon inherit the brand tint from its wrapper.
 */
const FEATURES: { key: string; icon: ReactElement }[] = [
  {
    key: 'discover',
    icon: (
      <path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    ),
  },
  {
    key: 'book',
    icon: (
      <path d="M8 2v4 M16 2v4 M3 9h18 M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z M9 14l2 2 4-4" />
    ),
  },
  {
    key: 'train',
    icon: <path d="M6 7v10 M3 9v6 M18 7v10 M21 9v6 M6 12h12" />,
  },
  {
    key: 'membership',
    icon: (
      <path d="M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z M2 11h20 M7 15h3" />
    ),
  },
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
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">{t('title')}</h2>
        <p className="mt-3 text-slate-600">{t('subtitle')}</p>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <div
            key={feature.key}
            className="rounded-card border border-slate-100 bg-white p-6 shadow-sm"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-card bg-brand-50 text-brand-600">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                {feature.icon}
              </svg>
            </span>
            <h3 className="mt-4 text-base font-semibold text-slate-900">
              {t(`items.${feature.key}.title`)}
            </h3>
            <p className="mt-2 text-sm text-slate-600">{t(`items.${feature.key}.description`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
