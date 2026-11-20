import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission } from '@fit/types';
import { ClassesTabs } from '@/components/classes-tabs';
import { consoleCan } from '@/lib/console-permissions';
import { getConsolePermissions } from '@/lib/permissions-server';
import { fetchClassRules } from '@/lib/api';
import { ClassRulesForm } from './class-rules-form';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  const t = await getTranslations('admin.classRules');
  return { title: t('title') };
}
const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  description: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
});
export default async function ClassRulesPage() {
  if (!consoleCan(await getConsolePermissions(), Permission.ClassWrite)) redirect('/403');
  const t = await getTranslations('admin.classRules');
  const rules = await fetchClassRules();
  return (
    <div {...stylex.props(styles.page)}>
      <ClassesTabs />
      <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
      <p {...stylex.props(styles.description)}>{t('description')}</p>
      <ClassRulesForm initial={rules} />
    </div>
  );
}
