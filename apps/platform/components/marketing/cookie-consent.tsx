'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CONSENT_OPEN_EVENT, claimFirstShow, writeConsent, type Consent } from '@/lib/consent';
import { Link } from '@/src/i18n/navigation';
import { COVER_SURFACE } from './cover-surface';
import { Btn } from './marketing-ui';

/**
 * The cookie banner: comes up once per browser (see `lib/consent.ts`), and
 * again only when the footer's cookie settings link is used. It sits on the
 * brand's cover surface, above the mobile dock, and never blocks the page.
 */
export function CookieConsent() {
  const t = useTranslations('common.cookies');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Read after mount: localStorage is not visible to the server render.
    if (claimFirstShow()) setOpen(true);
    const reopen = (): void => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  if (!open) return null;

  const choose = (consent: Consent): void => {
    writeConsent(consent);
    setOpen(false);
  };

  return (
    <div
      role="region"
      aria-label={t('title')}
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:px-6 sm:pb-6"
    >
      <div
        className="relative mx-auto flex max-w-3xl flex-col gap-4 overflow-hidden rounded-[1.5rem] p-5 text-white ring-1 ring-inset ring-white/15 shadow-[0_24px_60px_-20px_rgba(2,11,46,0.7)] sm:flex-row sm:items-center sm:gap-6 sm:p-6"
        style={COVER_SURFACE}
      >
        <div className="relative min-w-0 flex-1">
          <p className="font-display text-base font-black tracking-tight">{t('title')}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/85">
            {t('body')}{' '}
            <Link
              href="/privacy"
              className="font-semibold text-white underline underline-offset-2 hover:text-white/80"
            >
              {t('policy')}
            </Link>
          </p>
        </div>
        <div className="relative flex shrink-0 gap-2">
          <Btn v="glassOnBlue" size="md" onClick={() => choose('rejected')}>
            {t('decline')}
          </Btn>
          <Btn v="white" size="md" onClick={() => choose('accepted')}>
            {t('accept')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
