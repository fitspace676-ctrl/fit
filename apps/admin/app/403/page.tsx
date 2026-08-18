import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button-link';
import { getLocale } from 'next-intl/server';
import { Badge, buttonSurfaceProps } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { isStaff } from '@/lib/auth-session';
import { getServerSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Access denied - FormaCore Admin',
  description: 'You do not have permission to view this page.',
};

/**
 * The exit link below is chosen from the visitor's session, so this page is
 * per-request — the same convention the dashboard screens follow. Without it a
 * cached render is reused across visitors: locally, one operator's "Back to
 * dashboard" was served to the next request, which is exactly the wrong button.
 */
export const dynamic = 'force-dynamic';

/**
 * Where "get me out of here" should lead, which depends on *why* the visitor is
 * here. The middleware sends two different people to this page:
 *
 *   • A staffer who lacks the role an area requires — the console dashboard is
 *     still theirs, so point back at it.
 *   • A plain member who wandered into the console — the dashboard is exactly
 *     what they were just refused. Sending them there bounced them straight back
 *     to this page, a loop with no way out; their home is the member portal.
 *
 * The portal link must be a plain `<a>`: this app runs under basePath `/admin`,
 * and `next/link` would prefix it onto an absolute href, turning
 * `/ka/member/home` into `/admin/ka/member/home`. The portal is a different app
 * on the same origin, so it needs a real navigation anyway.
 */
async function exitRoute(): Promise<{ href: string; label: string; external: boolean }> {
  const session = await getServerSession();

  if (!session) {
    return { href: '/login', label: 'Sign in', external: false };
  }
  if (!isStaff(session.role)) {
    const locale = await getLocale();
    return { href: `/${locale}/member/home`, label: 'Go to your portal', external: true };
  }
  return { href: '/', label: 'Back to dashboard', external: false };
}

export default async function ForbiddenPage() {
  const exit = await exitRoute();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50 p-gutter text-center dark:bg-ink-950">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-300">
        <Icon name="lock" className="h-6 w-6" sw={2} />
      </span>
      <Badge tone="danger" label="403" />
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 dark:text-white">
        Access denied
      </h1>
      <p className="max-w-sm text-ink-500 dark:text-ink-400">
        Your account doesn’t have permission to view this part of the admin console. If you think
        this is a mistake, contact your gym owner.
      </p>
      {exit.external ? (
        // A plain `<a>`, not `ButtonLink`: this href leaves the console
        // entirely, and `next/link` would try to client-navigate it. It still
        // wears the kit's surface, so the two exits are the same object.
        <a href={exit.href} {...buttonSurfaceProps({ variant: 'secondary', size: 'card' })}>
          {exit.label}
        </a>
      ) : (
        <ButtonLink href={exit.href} variant="secondary" size="card" label={exit.label} />
      )}
    </main>
  );
}
