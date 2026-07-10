import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission, type LeadDetail } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLead, fetchLocations, fetchStaff } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Icon, type Tone } from '@/components/ui';
import type { SelectOption } from '../../leads-view';
import {
  LEAD_SOURCE_ICONS,
  LEAD_STATUS_TONES,
  daysInPipeline,
  formatDate,
  formatMoney,
  isFollowUpOverdue,
  isOpenLead,
  leadInitials,
} from '../../lead-meta';
import { LeadActions } from './lead-actions';
import { LeadTabs } from './lead-tabs';

/** Translator for the `admin.crm` namespace (from `getTranslations`). */
type T = Awaited<ReturnType<typeof getTranslations>>;

export const metadata: Metadata = {
  title: 'Lead — Fit Admin',
};

// The detail reflects live lead state and the staff session token, so it must
// never be statically rendered or cached.
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
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbLink: {
    textDecoration: 'none',
    color: 'var(--color-text-secondary)',
  },
  crumbCurrent: {
    color: 'var(--color-text-primary)',
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
  identityCard: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'flex-start',
    },
    justifyContent: {
      default: 'flex-start',
      '@media (min-width: 640px)': 'space-between',
    },
    gap: '1rem',
    padding: '1.25rem',
  },
  identityLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  identityAvatar: {
    display: 'flex',
    height: '4rem',
    width: '4rem',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '1.25rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  identityCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  name: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '0.75rem',
    rowGap: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  metaItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  metaIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  cardsGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '2fr 1fr',
    },
    alignItems: 'start',
  },
  infoCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  infoGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 480px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  fieldLabel: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  fieldValue: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  fieldValueRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  fieldValueAccent: {
    color: 'var(--color-text-accent)',
  },
  fieldValueOverdue: {
    color: 'var(--color-error)',
  },
  sideStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  kpiCard: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  kpiIcon: {
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  kpiIconSvg: {
    width: '1.25rem',
    height: '1.25rem',
  },
  kpiValue: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  kpiLabel: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  kpiContext: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  statsCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1.25rem',
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  statLabel: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  statValue: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
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

/** A label/value pair in the Lead Information card. */
function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.field)}>
      <p {...stylex.props(styles.fieldLabel)}>{label}</p>
      <div {...stylex.props(styles.fieldValue)}>{children}</div>
    </div>
  );
}

/** One compact KPI card — icon tile, headline value, label, and sub-context. */
function KpiCard({
  label,
  value,
  context,
  icon,
}: {
  label: string;
  value: string;
  context: string;
  icon: 'card' | 'target';
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.kpiCard}>
      <span {...stylex.props(styles.kpiIcon)}>
        <Icon name={icon} {...stylex.props(styles.kpiIconSvg)} />
      </span>
      <p {...stylex.props(styles.kpiValue)}>{value}</p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
      <p {...stylex.props(styles.kpiContext)}>{context}</p>
    </Card>
  );
}

/** The Pipeline Stats card — capture, tenure, and workload facts about the lead. */
function PipelineStats({ lead, t, locale }: { lead: LeadDetail; t: T; locale: string }) {
  const pendingTasks = lead.tasks.filter((task) => !task.completed).length;
  const rows: Array<[string, string]> = [
    [t('detail.daysInPipeline'), String(daysInPipeline(lead.createdAt))],
    [t('detail.createdOn'), formatDate(lead.createdAt, locale)],
    [t('detail.totalActivities'), String(lead.activities.length)],
    [t('detail.pendingTasks'), String(pendingTasks)],
  ];
  return (
    <Card variant="default" padding={0} xstyle={styles.statsCard}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.pipelineStats')}</h3>
      {rows.map(([label, value]) => (
        <div key={label} {...stylex.props(styles.statRow)}>
          <p {...stylex.props(styles.statLabel)}>{label}</p>
          <p {...stylex.props(styles.statValue)}>{value}</p>
        </div>
      ))}
    </Card>
  );
}

/**
 * The lead detail page (T12.3): breadcrumb + back link, an identity header card
 * with the stage badge and (behind `CrmManage`) the edit / close / delete
 * actions, the Lead Information + Expected Value + Expected Close + Pipeline
 * Stats cards, and the Overview / Activity / Notes / Tasks tabs. Every figure
 * comes from the tenant-scoped `GET /crm/leads/:id`; a 404 (unknown or
 * cross-tenant id) becomes Next's `notFound()`.
 */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('admin.crm');
  const locale = await getLocale();

  let lead: LeadDetail;
  try {
    lead = await fetchLead(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? t('errors.loadLead', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    return (
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/crm" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          {t('nav.backToCrm')}
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

  const fullName = `${lead.firstName} ${lead.lastName}`;
  const statusTone: Tone = LEAD_STATUS_TONES[lead.status];

  // Write controls are a `CrmManage` capability — shown only to staff who hold
  // it, and re-checked by the actions and the API behind them. The edit form's
  // staff/location selectors degrade to empty lists when their list endpoints
  // are not held / unavailable.
  const session = await getServerSession();
  const role = session?.role ?? null;
  const canManage = role !== null && roleHasPermission(role, Permission.CrmManage);
  let staffOptions: SelectOption[] = [];
  let locationOptions: SelectOption[] = [];
  if (canManage) {
    const canListStaff = role !== null && roleHasPermission(role, Permission.StaffManage);
    const canListLocations = role !== null && roleHasPermission(role, Permission.LocationRead);
    [staffOptions, locationOptions] = await Promise.all([
      canListStaff
        ? fetchStaff()
            .then((r) =>
              r.staff.map((s): SelectOption => ({ id: s.userId, name: s.name || s.email })),
            )
            .catch(() => [] as SelectOption[])
        : ([] as SelectOption[]),
      canListLocations
        ? fetchLocations({ limit: 100 })
            .then((r) => r.data.map((l): SelectOption => ({ id: l.id, name: l.name })))
            .catch(() => [] as SelectOption[])
        : ([] as SelectOption[]),
    ]);
  }

  const followUpOverdue = isOpenLead(lead.status) && isFollowUpOverdue(lead.followUpDate);

  return (
    <div {...stylex.props(styles.page)}>
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>{t('breadcrumb.home')}</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <Link href="/crm" {...stylex.props(styles.crumbLink)}>
          {t('breadcrumb.crm')}
        </Link>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.crumbCurrent)}>{fullName}</span>
      </nav>

      <Link href="/crm" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        {t('nav.backToCrm')}
      </Link>

      {/* Identity header card. */}
      <Card variant="default" padding={0} xstyle={styles.identityCard}>
        <div {...stylex.props(styles.identityLeft)}>
          <span {...stylex.props(styles.identityAvatar)}>
            {leadInitials(lead.firstName, lead.lastName)}
          </span>
          <div {...stylex.props(styles.identityCol)}>
            <div {...stylex.props(styles.titleRow)}>
              <h1 {...stylex.props(styles.name)}>{fullName}</h1>
              <Badge tone={statusTone}>{t(`status.${lead.status}`)}</Badge>
            </div>
            <div {...stylex.props(styles.metaRow)}>
              <span {...stylex.props(styles.metaItem)}>
                <Icon name={LEAD_SOURCE_ICONS[lead.source]} {...stylex.props(styles.metaIcon)} />
                {t(`source.${lead.source}`)}
              </span>
              <span aria-hidden>·</span>
              <span>
                {t('detail.daysInPipelineMeta', { days: daysInPipeline(lead.createdAt) })}
              </span>
            </div>
          </div>
        </div>
        {canManage ? (
          <LeadActions lead={lead} staffOptions={staffOptions} locationOptions={locationOptions} />
        ) : null}
      </Card>

      {/* Lead Information + Expected Value / Expected Close / Pipeline Stats. */}
      <section aria-label={t('detail.cardsLabel')} {...stylex.props(styles.cardsGrid)}>
        <Card variant="default" padding={0} xstyle={styles.infoCard}>
          <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.leadInformation')}</h3>
          <div {...stylex.props(styles.infoGrid)}>
            <InfoField label={t('columns.source')}>
              <span {...stylex.props(styles.fieldValueRow)}>
                <Icon name={LEAD_SOURCE_ICONS[lead.source]} {...stylex.props(styles.metaIcon)} />
                {t(`source.${lead.source}`)}
              </span>
            </InfoField>
            <InfoField label={t('columns.interest')}>
              <span {...stylex.props(lead.interest.length > 0 && styles.fieldValueAccent)}>
                {lead.interest || '—'}
              </span>
            </InfoField>
            <InfoField label={t('columns.assignedTo')}>
              {lead.assignedTo?.name ?? t('list.unassigned')}
            </InfoField>
            <InfoField label={t('columns.location')}>{lead.location?.name ?? '—'}</InfoField>
            <InfoField label={t('form.followUpDate')}>
              <span {...stylex.props(followUpOverdue && styles.fieldValueOverdue)}>
                {formatDate(lead.followUpDate, locale)}
                {followUpOverdue ? ` ${t('detail.overdueSuffix')}` : ''}
              </span>
            </InfoField>
            <InfoField label={t('form.probability')}>{`${lead.probability}%`}</InfoField>
            <InfoField label={t('form.phone')}>
              <span {...stylex.props(styles.fieldValueRow)}>
                <Icon name="phone" {...stylex.props(styles.metaIcon)} />
                {lead.phone || '—'}
              </span>
            </InfoField>
            <InfoField label={t('form.email')}>
              <span {...stylex.props(styles.fieldValueRow)}>
                <Icon name="mail" {...stylex.props(styles.metaIcon)} />
                {lead.email || '—'}
              </span>
            </InfoField>
          </div>
        </Card>

        <div {...stylex.props(styles.sideStack)}>
          <KpiCard
            label={t('detail.expectedValue')}
            value={formatMoney(lead.expectedValue)}
            context={t('detail.weighted', {
              amount: formatMoney(Math.round((lead.expectedValue * lead.probability) / 100)),
            })}
            icon="card"
          />
          <KpiCard
            label={t('detail.expectedClose')}
            value={formatDate(lead.expectedCloseDate, locale)}
            context={t('detail.probabilityContext', { percent: lead.probability })}
            icon="target"
          />
          <PipelineStats lead={lead} t={t} locale={locale} />
        </div>
      </section>

      <LeadTabs lead={lead} canManage={canManage} />
    </div>
  );
}
