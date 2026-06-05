import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { classCalendarViewSchema, DEFAULT_CLASS_VIEW } from '@fit/types';
import { getActiveGymId } from '@/lib/active-gym';
import { ClassesBrowser } from '@/src/components/classes/ClassesBrowser';
import { parseFilters } from '@/src/components/classes/class-filters';

export const metadata: Metadata = {
  title: 'Classes — Fit',
  description: 'Browse the class schedule and book your next session.',
};

/**
 * Render per request, never at build: the active gym is resolved from the
 * request `Host` (`getActiveGymId` → `headers()`), so a prerendered shell would
 * bake in a null gym and show the empty state on every tenant subdomain.
 */
export const dynamic = 'force-dynamic';

/** Raw search params the classes page reads (all optional, all strings). */
interface ClassesSearchParams {
  view?: string;
  week?: string;
  class?: string;
  type?: string;
  trainer?: string;
  location?: string;
  time?: string;
}

/**
 * Public classes page. A Server Component that resolves the active gym and the
 * initial view/week/selection from the URL, then hands off to the client
 * {@link ClassesBrowser}, which owns the calendar, the week fetches, and the
 * detail drawer. Reachable signed-out (see the web middleware's public paths):
 * the booking CTA is the only auth gate.
 */
export default async function ClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ClassesSearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, gymId] = await Promise.all([getTranslations('classes'), getActiveGymId()]);

  const view = classCalendarViewSchema.safeParse(sp.view).data ?? DEFAULT_CLASS_VIEW;
  const filters = parseFilters(sp);

  return (
    <main className="mx-auto w-full max-w-5xl px-gutter py-10">
      <header className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      <ClassesBrowser
        gymId={gymId}
        initialView={view}
        initialWeek={sp.week ?? ''}
        initialClassId={sp.class}
        initialFilters={filters}
      />
    </main>
  );
}
