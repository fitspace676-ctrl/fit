'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@fit/i18n';
import { cn } from '@/lib/utils';
import { Link, usePathname } from '@/src/i18n/navigation';

/** One year, in seconds — how long an explicit locale choice is remembered. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The languages, in menu order. `code` is the short form on the trigger and
 * `name` the language's own name in its own script. Neither is translated: the
 * point of a language menu is that you can find the one you read whatever
 * language the page is currently in.
 */
const OPTIONS: readonly { locale: Locale; code: string; name: string }[] = [
  { locale: 'en', code: 'EN', name: 'English' },
  { locale: 'ka', code: 'ქა', name: 'ქართული' },
];

const GLOBE =
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.4 3.75-5.4 3.75-9S14.5 5.4 12 3m0 18c-2.5-2.4-3.75-5.4-3.75-9S9.5 5.4 12 3M3.5 9h17M3.5 15h17';

/**
 * Language menu for the marketing nav and the mobile drawer: a compact trigger
 * (globe, current code, chevron) opening a small menu of languages, each
 * linking to the current page under that locale (`usePathname()` is
 * locale-less, so the `Link`'s `locale` prop builds the prefixed href). The
 * choice is persisted in the `NEXT_LOCALE` cookie.
 *
 * Behaves like a menu button: Enter / Space / ArrowDown open it on the active
 * language, ArrowUp / ArrowDown / Home / End move, Escape or Tab closes and
 * returns focus to the trigger, and a click anywhere outside closes it.
 */
export function LocaleSwitcher({
  className,
  align = 'end',
}: {
  className?: string;
  /** Which edge of the trigger the menu lines up with. */
  align?: 'start' | 'end';
}) {
  const activeLocale = useLocale() as Locale;
  const t = useTranslations('common.language');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const menuId = useId();

  const active = OPTIONS.find((o) => o.locale === activeLocale) ?? OPTIONS[0]!;
  const activeIndex = OPTIONS.indexOf(active);

  // Close on any pointer down outside the switcher.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  // Opening moves focus onto the active language.
  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function close(returnFocus: boolean): void {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function persist(locale: Locale): void {
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const items = itemRefs.current.filter(Boolean) as HTMLAnchorElement[];
    const at = items.indexOf(document.activeElement as HTMLAnchorElement);
    const focusAt = (i: number): void => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(at + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(at - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(items.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn('relative shrink-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t('label')}: ${t(active.locale)}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-btn border border-overlay/15 bg-overlay/[0.06] pl-2.5 pr-2 text-xs font-bold text-fg transition-colors hover:bg-overlay/[0.12] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-overlay/30',
          open && 'bg-overlay/[0.12]',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-muted"
          aria-hidden="true"
        >
          <path d={GLOBE} />
        </svg>
        <span className="min-w-[1.25rem] text-center tracking-[0.02em]">{active.code}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        id={menuId}
        role="menu"
        aria-label={t('label')}
        onKeyDown={onMenuKeyDown}
        className={cn(
          'absolute top-[calc(100%+0.5rem)] z-50 min-w-[11rem] origin-top rounded-[0.9rem] border border-overlay/10 bg-surface p-1 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.02] transition duration-150 ease-out',
          align === 'end' ? 'right-0' : 'left-0',
          open
            ? 'visible translate-y-0 scale-100 opacity-100'
            : 'invisible -translate-y-1 scale-[0.98] opacity-0 pointer-events-none',
        )}
      >
        {OPTIONS.map(({ locale, code, name }, i) => {
          const current = locale === activeLocale;
          return (
            <Link
              key={locale}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              href={pathname}
              locale={locale}
              role="menuitemradio"
              aria-checked={current}
              lang={locale}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                persist(locale);
                setOpen(false);
              }}
              className={cn(
                'flex items-center gap-3 rounded-[0.6rem] px-2.5 py-2 text-sm outline-none transition-colors hover:bg-overlay/[0.06] focus-visible:bg-overlay/[0.08]',
                current ? 'font-semibold text-fg' : 'text-strong',
              )}
            >
              <span className="grid h-6 w-7 place-items-center rounded-md bg-overlay/[0.07] text-[10px] font-bold tracking-[0.02em] text-muted">
                {code}
              </span>
              <span className="flex-1">{name}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  'h-4 w-4 text-brand-600 dark:text-brand-300',
                  !current && 'invisible',
                )}
                aria-hidden="true"
              >
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
