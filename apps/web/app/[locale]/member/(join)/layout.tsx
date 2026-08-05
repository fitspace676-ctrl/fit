import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { LocaleSwitcher } from '@/src/components/LocaleSwitcher';
import { AuroraBackground, Icon, SkipLink, ToastProvider } from '@/src/components/ui';

/**
 * The join funnel's shell — the chrome around the purchase wizard and its
 * confirmation.
 *
 * Deliberately *not* the member portal's. The wizard's whole audience is people
 * who are not members yet, and the portal header offers them a menu they cannot
 * use: bookings they have none of, a cart, notifications, an account avatar. So
 * this group carries only what a checkout needs — the brand mark (an exit back
 * to the site), a locale switcher, and the same Aurora backdrop so the funnel
 * still looks like the rest of the product.
 *
 * The route group changes no URLs: the wizard stays at `/member/checkout`. It exists
 * purely to break the layout inheritance that put the member nav on a page for
 * non-members.
 *
 * A member *renewing* their membership passes through here too (the membership
 * page links to `/member/checkout`); the brand mark is their way back out, and the
 * wizard's own Back button walks the steps.
 */
export default async function JoinLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tCommon] = await Promise.all([
    getTranslations('member.shell'),
    getTranslations('common'),
  ]);

  return (
    <ToastProvider>
      <SkipLink>{t('skipToContent')}</SkipLink>
      <AuroraBackground />
      <div className="relative flex min-h-screen flex-col">
        <header className="border-b border-ink-100 dark:border-white/10">
          <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            {/* Home, not `/member/home`: a signed-out visitor has no member home to land on. */}
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_8px_24px_-8px_rgba(98,87,227,0.8)]">
                <Icon name="bolt" className="h-5 w-5" sw={2.4} />
              </span>
              <span className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">
                {tCommon('appName')}
              </span>
            </Link>
            <LocaleSwitcher />
          </div>
        </header>

        <main id="main-content" className="flex-1">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
