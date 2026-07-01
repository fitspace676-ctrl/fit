import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { fetchClassInstance } from '@/lib/classes';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { ClassDetail } from '@/src/components/classes/ClassDetail';
import { ClassNotFound } from '@/src/components/classes/ClassNotFound';

/**
 * Render per request, never at build: the active gym is resolved from the
 * request `Host` (`getActiveGymId` → `headers()`), so a prerendered shell would
 * bake in a null gym and 404 every class on every tenant subdomain.
 */
export const dynamic = 'force-dynamic';

interface ClassDetailParams {
  locale: string;
  id: string;
}

/**
 * Load one class occurrence for the active gym, or `null` when there is no tenant
 * in scope / the id is unknown / a transient failure occurs. Never throws: like
 * `getActiveGymId`, the detail page degrades to its "not found" state rather than
 * an error screen. Next memoises the underlying `fetch`, so calling this from
 * both `generateMetadata` and the page costs a single round-trip.
 */
async function loadInstance(id: string) {
  const gymId = await getActiveGymId();
  if (!gymId) {
    return null;
  }
  try {
    return await fetchClassInstance({ gymId, id });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<ClassDetailParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const instance = await loadInstance(id);
  return {
    title: instance ? `${instance.title} — Fit` : 'Class — Fit',
    description: instance?.description || 'See the class details and book your spot.',
  };
}

/**
 * Public class detail page. A Server Component that resolves the active gym,
 * loads one occurrence's full detail, and renders it — or a branded "not found"
 * state when the id resolves to no class for this gym. Reachable signed-out (see
 * the web middleware's public paths): pure discovery, with the booking CTA the
 * only auth gate.
 */
export default async function ClassDetailPage({ params }: { params: Promise<ClassDetailParams> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [t, instance] = await Promise.all([getTranslations('classes'), loadInstance(id)]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Link
        href="/classes"
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
      >
        <Icon name="chevronLeft" className="h-4 w-4" sw={2.2} />
        {t('detail.back')}
      </Link>

      {instance ? <ClassDetail instance={instance} /> : <ClassNotFound />}
    </div>
  );
}
