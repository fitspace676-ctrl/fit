import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  roleHasPermission,
  type EmailTemplateGroup,
  type ListEmailTemplatesResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchEmailTemplates } from '@/lib/api';
import { Icon } from '@/components/ui';
import { TemplateEditor } from './template-editor';

export const metadata: Metadata = {
  title: 'Email templates - Fit Admin',
  description:
    'The wording of every email the system sends on your behalf — birthdays, renewals, payments, class changes and staff shifts.',
};

export const dynamic = 'force-dynamic';

/** The sections the list is grouped under, in the order staff scan them. */
const GROUPS: { key: EmailTemplateGroup; title: string; blurb: string }[] = [
  {
    key: 'membership',
    title: 'Membership',
    blurb: 'Joining, birthdays, renewals, freezes and members drifting away.',
  },
  { key: 'payments', title: 'Payments', blurb: 'Receipts, failed charges and overdue invoices.' },
  {
    key: 'classes',
    title: 'Classes & bookings',
    blurb: 'Reminders, cancellations, waitlists and what trainers are told.',
  },
  { key: 'staff', title: 'Staff', blurb: 'What your team is sent.' },
];

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    textDecoration: 'none',
  },
  crumbIcon: { width: '0.875rem', height: '0.875rem' },
  headTitles: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '46rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  group: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  groupHead: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  groupTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.0625rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  groupBlurb: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  card: { overflow: 'hidden' },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    color: 'var(--color-error)',
  },
  errorIcon: { width: '1.25rem', height: '1.25rem', flexShrink: 0 },
});

/**
 * Settings → Email templates.
 *
 * Every email the system sends on the gym's behalf, with its wording editable.
 * All of them exist for every gym from day one: the defaults live in code and the
 * database holds only what a gym has changed, so this list is never empty and
 * "restore default" is a real option rather than a copy of today's text.
 *
 * Each can also be switched off. That is deliberately separate from editing —
 * a gym that does not want birthday emails should not have to empty the body to
 * stop them, and should get its wording back if it changes its mind.
 */
export default async function EmailTemplatesPage() {
  const session = await getServerSession();
  if (session === null || !roleHasPermission(session.role, Permission.GymManage)) {
    return (
      <div {...stylex.props(styles.page)}>
        <Card role="alert" padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>You do not have permission to manage email templates.</span>
        </Card>
      </div>
    );
  }

  let result: ListEmailTemplatesResponse;
  try {
    result = await fetchEmailTemplates();
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load the templates (${error.status}): ${error.message}`
        : 'Could not reach the Fit API.';
    return (
      <div {...stylex.props(styles.page)}>
        <Card role="alert" padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>{message}</span>
        </Card>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/settings" {...stylex.props(styles.breadcrumb)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.crumbIcon)} />
        Settings
      </Link>

      <div {...stylex.props(styles.headTitles)}>
        <h1 {...stylex.props(styles.title)}>Email templates</h1>
        <p {...stylex.props(styles.subtitle)}>
          The wording of every email sent on your behalf. Edit any of them in your own voice, use{' '}
          <code>{'{{first_name}}'}</code>-style tokens to personalise, or switch one off entirely.
          Anything you have not edited uses the built-in wording and stays up to date.
        </p>
      </div>

      {GROUPS.map((group) => {
        const templates = result.data.filter((template) => template.group === group.key);
        if (templates.length === 0) return null;
        return (
          <section key={group.key} {...stylex.props(styles.group)}>
            <div {...stylex.props(styles.groupHead)}>
              <h2 {...stylex.props(styles.groupTitle)}>{group.title}</h2>
              <span {...stylex.props(styles.groupBlurb)}>{group.blurb}</span>
            </div>
            <Card padding="none" xstyle={styles.card}>
              {templates.map((template) => (
                <TemplateEditor key={template.key} template={template} />
              ))}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
