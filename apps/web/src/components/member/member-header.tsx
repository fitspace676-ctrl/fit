'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { useSession } from '@/hooks/use-session';
import { ThemeToggle } from './theme-toggle';
import { NAV_ITEMS, isActive } from './nav-items';

/** Brand mark — the gradient bolt badge + wordmark, linking home. */
function Logo({ label }: { label: string }) {
  return (
    <Link href="/home" className="flex items-center gap-2.5">
      <span className="grid h-10 w-10 place-items-center rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_8px_24px_-8px_rgba(98,87,227,0.8)]">
        <Icon name="bolt" className="h-5 w-5" sw={2.4} />
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">
        {label}
      </span>
    </Link>
  );
}

/** The notifications bell + dropdown. Empty until member notifications are wired. */
function Notifications() {
  const t = useTranslations('member.shell');
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('notifications')}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-btn text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white"
      >
        <Icon name="bell" className="h-5 w-5" />
        <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-ink-950" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-card border border-ink-200 bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-ink-900">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-white/10">
              <p className="text-sm font-bold text-ink-900 dark:text-white">{t('notifications')}</p>
            </div>
            <div className="grid place-items-center gap-2 px-4 py-10 text-center">
              <Icon name="check" className="h-6 w-6 text-ink-300 dark:text-ink-500" />
              <p className="text-sm text-ink-500 dark:text-ink-400">{t('noNotifications')}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Persistent member-portal header: logo, primary nav, theme/notifications/avatar. */
export function MemberHeader() {
  const t = useTranslations('member');
  const pathname = usePathname();
  const { user } = useSession();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/70">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Logo label={t('shell.brand')} />

        {/* Desktop primary nav */}
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex h-10 items-center gap-2 rounded-btn px-3.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_4px_16px_-6px_rgba(124,58,237,0.8)]'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white'
                }`}
              >
                <Icon name={item.icon} className="h-4 w-4" sw={2.2} />
                {t(`nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Link
            href="/cart"
            aria-label={t('nav.cart')}
            className="grid h-10 w-10 place-items-center rounded-btn text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <Icon name="bag" className="h-5 w-5" />
          </Link>
          <Notifications />

          <Link
            href="/account/profile"
            aria-label={t('nav.profile')}
            className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white ring-2 ring-white transition-transform hover:scale-105 dark:ring-ink-950"
          >
            {user ? (
              <Icon name="user" className="h-5 w-5" sw={2.2} />
            ) : (
              <Icon name="user" className="h-5 w-5 opacity-80" sw={2.2} />
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-label={navOpen ? t('shell.closeMenu') : t('shell.openMenu')}
            className="grid h-10 w-10 place-items-center rounded-btn text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-white/5 md:hidden"
          >
            <Icon name={navOpen ? 'x' : 'filter'} className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="border-t border-ink-100 bg-white px-4 pb-4 pt-2 dark:border-white/10 dark:bg-ink-950 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  className={`flex h-11 items-center gap-3 rounded-btn px-3.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white'
                      : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon name={item.icon} className="h-5 w-5" sw={2.1} />
                  {t(`nav.${item.key}`)}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
