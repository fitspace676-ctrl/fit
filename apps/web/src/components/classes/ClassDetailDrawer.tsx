'use client';

import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ClassInstanceCard } from '@fit/types';
import { Link, usePathname } from '@/src/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { formatTime } from './date-utils';

export interface ClassDetailDrawerProps {
  /** The class to show, or `null` when the drawer is closed. */
  instance: ClassInstanceCard | null;
  /** Close the drawer (overlay click, close button, or Esc). */
  onClose: () => void;
}

/**
 * Right-side sheet showing one class's details and the booking CTA.
 *
 * Built as a plain overlay + panel (the app has no shadcn `<Sheet>` yet). The
 * CTA is auth-gated: a signed-out visitor gets a link to `/login?from=<this
 * page, with the class preselected>` so they return here after signing in; the
 * actual booking call is out of scope for T3.4 and lands in T5.4, so the
 * signed-in CTA is a placeholder button until then.
 */
export function ClassDetailDrawer({ instance, onClose }: ClassDetailDrawerProps) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useSession();

  const open = instance !== null;

  // Close on Escape while open.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!instance) {
    return null;
  }

  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const isFull = spotsLeft === 0;
  const bookedPct =
    instance.capacity > 0 ? Math.min((instance.bookedCount / instance.capacity) * 100, 100) : 0;

  // Where login should send the visitor back to: this page, with the class
  // preselected so the drawer can reopen. next-intl's <Link> prefixes the
  // locale onto `/login`, and the login form validates this same-origin path.
  const returnParams = new URLSearchParams(searchParams?.toString() ?? '');
  returnParams.set('class', instance.id);
  const from = `/${locale}${pathname}?${returnParams.toString()}`;
  const loginHref = `/login?from=${encodeURIComponent(from)}`;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={instance.title}>
      <button
        type="button"
        aria-label={t('drawer.close')}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 transition-opacity"
      />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col gap-5 overflow-y-auto bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: instance.color }}
            />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {instance.category}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('drawer.close')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <h2 className="text-xl font-semibold text-slate-900">{instance.title}</h2>

        <dl className="flex flex-col gap-3 text-sm">
          <DetailRow label={t('drawer.time')}>
            {formatTime(instance.startsAt, locale)} – {formatTime(instance.endsAt, locale)}
          </DetailRow>
          {instance.trainerName ? (
            <DetailRow label={t('drawer.trainer')}>{instance.trainerName}</DetailRow>
          ) : null}
          {instance.locationName ? (
            <DetailRow label={t('drawer.location')}>{instance.locationName}</DetailRow>
          ) : null}
        </dl>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{t('drawer.capacity')}</span>
            <span className="tabular-nums text-slate-500">
              {instance.bookedCount} / {instance.capacity}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${isFull ? 'bg-red-400' : 'bg-brand-500'}`}
              style={{ width: `${bookedPct}%` }}
            />
          </div>
          <p className={`text-xs ${isFull ? 'text-red-600' : 'text-slate-500'}`}>
            {isFull ? t('card.full') : t('card.spotsLeft', { count: spotsLeft })}
          </p>
        </div>

        <div className="mt-auto pt-2">
          {user ? (
            // Booking is out of scope for T3.4 — the API call is wired in T5.4.
            // Render the CTA so the flow is visually complete; the handler lands
            // with the booking endpoint.
            <button
              type="button"
              disabled={isFull}
              className="w-full rounded-card bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFull ? t('drawer.full') : t('drawer.book')}
            </button>
          ) : (
            <Link
              href={loginHref}
              className="block w-full rounded-card bg-brand-600 px-6 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              {t('drawer.signInToBook')}
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}

/** A labelled detail line in the drawer's definition list. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}
