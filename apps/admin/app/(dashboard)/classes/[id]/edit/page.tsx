import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchClassTemplate } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { ClassTemplateForm } from '../../class-template-form';
import { loadRelationOptions } from '../../options';

export const metadata: Metadata = {
  title: 'Edit class - Fit Admin',
};

// Reflects the staff session and writes live template state — never cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  errorPage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-accent)',
  },
  backIcon: {
    width: '1rem',
    height: '1rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
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
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/**
 * Edit-a-class-template page (T5.2). Like {@link NewClassTemplatePage} it gates on
 * the `ClassWrite` capability (not linear by role) before rendering, and reuses the
 * shared {@link ClassTemplateForm} prefilled from `GET /admin/classes/:id` — the
 * stored `rrule` is re-parsed into the visual recurrence editor. A `404` from the
 * API — unknown or cross-tenant id — becomes Next's `notFound()`.
 */
export default async function EditClassTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ClassWrite)) {
    redirect('/403');
  }

  let template;
  try {
    template = await fetchClassTemplate(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this class (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/classes" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          Back to classes
        </Link>
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }

  const { trainers, locations, plans, classTypes } = await loadRelationOptions();

  return (
    <div {...stylex.props(styles.page)}>
      <Link href={`/classes/${id}`} {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        Back to class
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>Edit class</h1>
        <p {...stylex.props(styles.subtitle)}>
          Update {template.title}’s details, schedule, capacity, duration, and default trainer and
          location.
        </p>
      </header>

      <ClassTemplateForm
        mode="edit"
        templateId={id}
        trainers={trainers}
        locations={locations}
        plans={plans}
        classTypes={classTypes}
        initial={{
          title: template.title,
          description: template.description,
          category: template.category,
          trainerId: template.trainerId,
          locationId: template.locationId,
          room: template.room,
          capacity: template.capacity,
          durationMinutes: template.durationMinutes,
          rrule: template.rrule,
          color: template.color,
          pricingRule: template.pricingRule,
          priceMinor: template.priceMinor,
          includedPlanIds: template.includedPlanIds,
          minAttendance: template.minAttendance,
          pt30Minor: template.pt30Minor,
          pt45Minor: template.pt45Minor,
          pt60Minor: template.pt60Minor,
          validFrom: template.validFrom,
          validUntil: template.validUntil,
        }}
      />
    </div>
  );
}
