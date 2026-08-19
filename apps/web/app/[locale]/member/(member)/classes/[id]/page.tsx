import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId, getActiveGymTimezone } from '@/lib/active-gym';
import { fetchClassInstance } from '@/lib/classes';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { ClassDetail } from '@/src/components/classes/ClassDetail';
import { ClassNotFound } from '@/src/components/classes/ClassNotFound';

// Astryx migration (T11), now on the portal kit: the detail route shell (back link + column) is
// authored in compiled StyleX over the Fit brand tokens — no Tailwind utilities.

const styles = stylex.create({
  page: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '42rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  back: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    alignSelf: 'flex-start',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    textDecoration: 'none',
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
  backIcon: {
    height: '1rem',
    width: '1rem',
  },
});

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
 *
 * Returns the resolved `gymId` alongside the instance so the page can hand it to
 * the live-occupancy island (T8.10) without a second subdomain lookup.
 */
async function loadInstance(id: string) {
  const gymId = await getActiveGymId();
  if (!gymId) {
    return null;
  }
  try {
    const instance = await fetchClassInstance({ gymId, id });
    return instance ? { gymId, instance } : null;
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
  const loaded = await loadInstance(id);
  const instance = loaded?.instance ?? null;
  return {
    title: instance ? `${instance.title} - FormaCore` : 'Class - FormaCore',
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

  const [t, loaded, timeZone] = await Promise.all([
    getTranslations('classes'),
    loadInstance(id),
    getActiveGymTimezone(),
  ]);

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/member/classes" {...stylex.props(styles.back)}>
        <Icon name="chevronLeft" {...stylex.props(styles.backIcon)} sw={2.2} />
        {t('detail.back')}
      </Link>

      {loaded ? (
        <ClassDetail timeZone={timeZone} instance={loaded.instance} gymId={loaded.gymId} />
      ) : (
        <ClassNotFound />
      )}
    </div>
  );
}
