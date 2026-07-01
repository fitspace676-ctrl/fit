import { getTranslations } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';

/** A footer link column: a heading plus its locale-aware links. */
interface FooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

/**
 * Landing footer — brand line, three link columns (product / company / legal),
 * and a localized copyright. Internal destinations use the locale-aware `Link`
 * so they stay under the active `/ka` or `/en` prefix. The year is passed as a
 * string so the ICU formatter doesn't group the digits (e.g. `2,026`).
 */
export async function Footer() {
  const t = await getTranslations('footer');
  const year = String(new Date().getFullYear());

  const columns: FooterColumn[] = [
    {
      heading: t('product'),
      links: [
        { label: t('links.classes'), href: '/classes' },
        { label: t('links.trainers'), href: '/trainers' },
        { label: t('links.pricing'), href: '/#pricing' },
      ],
    },
    {
      heading: t('company'),
      links: [
        { label: t('links.about'), href: '/about' },
        { label: t('links.contact'), href: '/contact' },
      ],
    },
    {
      heading: t('legal'),
      links: [
        { label: t('links.privacy'), href: '/privacy' },
        { label: t('links.terms'), href: '/terms' },
      ],
    },
  ];

  return (
    <footer className="border-t border-ink-200 bg-white dark:border-white/10 dark:bg-ink-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-gutter py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="max-w-xs">
          <span className="font-display text-lg font-extrabold text-brand-600 dark:text-brand-300">
            Fit
          </span>
          <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">{t('tagline')}</p>
        </div>
        {columns.map((column) => (
          <div key={column.heading}>
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">{column.heading}</h3>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-ink-500 dark:text-ink-400">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-brand-600 dark:hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-200 px-gutter py-6 dark:border-white/10">
        <p className="mx-auto max-w-6xl text-sm text-ink-400">{t('copyright', { year })}</p>
      </div>
    </footer>
  );
}
