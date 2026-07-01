'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { NAV_ITEMS, isActive } from './nav-items';

/** The fixed bottom tab bar shown on mobile (hidden from `md` up). */
export function MobileTabBar() {
  const t = useTranslations('member.nav');
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/85 md:hidden">
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                  active
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'text-ink-400 hover:text-ink-700 dark:text-ink-500 dark:hover:text-ink-200'
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5" sw={2.1} />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
