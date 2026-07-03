import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { Icon } from '@/components/ui';
import { MemberForm } from '../member-form';

export const metadata: Metadata = {
  title: 'New member — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Create-a-member page (T4.3). The middleware already requires a staff session to
 * reach `/members`, but creating is a `MemberWrite` capability that isn't linear
 * by role (a RECEPTIONIST has it, a TRAINER does not), so the page itself gates on
 * the permission and bounces an under-privileged staffer to `/403`. The form and
 * the Server Action it calls both re-check, and the API enforces it again.
 */
export default async function NewMemberPage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.MemberWrite)) {
    redirect('/403');
  }

  const t = await getTranslations('admin.members');

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label={t('breadcrumb.label')}
        className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
      >
        <span>Iron Gym</span>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <Link href="/members" className="hover:text-ink-600 dark:hover:text-ink-300">
          {t('breadcrumb.members')}
        </Link>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <span className="text-ink-600 dark:text-ink-300">{t('list.addMember')}</span>
      </nav>

      <Link
        href="/members"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        {t('nav.backToMembers')}
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('list.addMember')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('newPage.subtitle')}</p>
      </header>

      <MemberForm mode="create" />
    </div>
  );
}
