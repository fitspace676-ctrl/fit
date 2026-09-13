import { getTranslations } from 'next-intl/server';

/**
 * What a tenant subdomain that names no gym renders instead of the portal —
 * `typo.formacore.io`, or a gym that no longer exists.
 *
 * Rendered by the locale layout in place of the page (see
 * `getActiveGymPresence`), so every route on such a host says the same thing
 * rather than a sign-in form for a gym nobody can join. There is deliberately no
 * link onward: this host has no home to go back to, and guessing which gym the
 * visitor meant would be worse than saying plainly that this one is not here.
 */
export async function GymNotFound() {
  const t = await getTranslations('errors.gymNotFound');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
      <span className="rounded-card bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
        {t('badge')}
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
        {t('title')}
      </h1>
      <p className="max-w-sm text-slate-500">{t('description')}</p>
    </main>
  );
}
