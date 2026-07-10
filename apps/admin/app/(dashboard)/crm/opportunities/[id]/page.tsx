import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission, type OpportunityDetail } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchOpportunity, fetchStaff } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Icon, type Tone } from '@/components/ui';
import type { SelectOption } from '../../leads-view';
import { daysInPipeline, formatDate, formatMoney } from '../../lead-meta';
import {
  OPPORTUNITY_STATUS_TONES,
  OPPORTUNITY_TYPE_ICONS,
  memberInitials,
  weightedValue,
} from '../../opportunity-meta';
import { OpportunityActions } from './opportunity-actions';
import { OpportunityTabs } from './opportunity-tabs';

/** Translator for the `admin.crm` namespace (from `getTranslations`). */
type T = Awaited<ReturnType<typeof getTranslations>>;

export const metadata: Metadata = {
  title: 'Opportunity — Fit Admin',
};

// The detail reflects live opportunity state and the staff session token, so it
// must never be statically rendered or cached.
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
  sideStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  dealCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  dealRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  dealIcon: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  dealIconSvg: {
    width: '1.125rem',
    height: '1.125rem',
  },
  dealLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  dealLabel: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  dealValue: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.125rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  weightedRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.875rem',
  },
  weightedValue: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.125rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-success)',
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

/** A label/value pair in the Opportunity Information card. */
function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.field)}>
      <p {...stylex.props(styles.fieldLabel)}>{label}</p>
      <div {...stylex.props(styles.fieldValue)}>{children}</div>
    </div>
  );
}

/** The Timeline card — capture, tenure, and expected close facts about the deal. */
function DealTimeline({
  opportunity,
  t,
  locale,
}: {
  opportunity: OpportunityDetail;
  t: T;
  locale: string;
}) {
  const rows: Array<[string, string]> = [
    [t('detail.createdOn'), formatDate(opportunity.createdAt, locale)],
    [t('detail.daysInPipeline'), String(daysInPipeline(opportunity.createdAt))],
    [t('detail.expectedClose'), formatDate(opportunity.expectedCloseDate, locale)],
    [t('detail.totalActivities'), String(opportunity.activities.length)],
  ];
  return (
    <Card variant="default" padding={0} xstyle={styles.statsCard}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('opportunityDetail.timeline')}</h3>
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
 * The opportunity detail page (T12.4): breadcrumb + back link, an identity
 * header card with the stage badge and (behind `CrmManage`) the edit / close /
 * delete actions, the Opportunity Information + Deal Value + Timeline cards, and
 * the Overview / Activity / Notes / Tasks tabs. Every figure comes from the
 * tenant-scoped `GET /crm/opportunities/:id`; a 404 (unknown or cross-tenant id)
 * becomes Next's `notFound()`.
 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('admin.crm');
  const locale = await getLocale();

  let opportunity: OpportunityDetail;
  try {
    opportunity = await fetchOpportunity(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? t('errors.loadOpportunity', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    return (
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/crm?tab=opportunities" {...stylex.props(styles.backLink)}>
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

  const statusTone: Tone = OPPORTUNITY_STATUS_TONES[opportunity.status];

  // Write controls are a `CrmManage` capability — shown only to staff who hold
  // it, and re-checked by the actions and the API behind them. The edit form's
  // staff selector degrades to an empty list when `StaffManage` is not held.
  const session = await getServerSession();
  const role = session?.role ?? null;
  const canManage = role !== null && roleHasPermission(role, Permission.CrmManage);
  let staffOptions: SelectOption[] = [];
  if (canManage && role !== null && roleHasPermission(role, Permission.StaffManage)) {
    staffOptions = await fetchStaff()
      .then((r) => r.staff.map((s): SelectOption => ({ id: s.userId, name: s.name || s.email })))
      .catch(() => [] as SelectOption[]);
  }

  return (
    <div {...stylex.props(styles.page)}>
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>{t('breadcrumb.home')}</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <Link href="/crm?tab=opportunities" {...stylex.props(styles.crumbLink)}>
          {t('breadcrumb.crm')}
        </Link>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.crumbCurrent)}>{opportunity.member.name}</span>
      </nav>

      <Link href="/crm?tab=opportunities" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        {t('nav.backToCrm')}
      </Link>

      {/* Identity header card. */}
      <Card variant="default" padding={0} xstyle={styles.identityCard}>
        <div {...stylex.props(styles.identityLeft)}>
          <span {...stylex.props(styles.identityAvatar)}>
            {memberInitials(opportunity.member.name)}
          </span>
          <div {...stylex.props(styles.identityCol)}>
            <div {...stylex.props(styles.titleRow)}>
              <h1 {...stylex.props(styles.name)}>{opportunity.member.name}</h1>
              <Badge tone={statusTone}>{t(`opportunityStatus.${opportunity.status}`)}</Badge>
            </div>
            <div {...stylex.props(styles.metaRow)}>
              <span {...stylex.props(styles.metaItem)}>
                <Icon
                  name={OPPORTUNITY_TYPE_ICONS[opportunity.type]}
                  {...stylex.props(styles.metaIcon)}
                />
                {t(`opportunityType.${opportunity.type}`)}
              </span>
              <span aria-hidden>·</span>
              <span>
                {t('detail.daysInPipelineMeta', {
                  days: daysInPipeline(opportunity.createdAt),
                })}
              </span>
            </div>
          </div>
        </div>
        {canManage ? (
          <OpportunityActions opportunity={opportunity} staffOptions={staffOptions} />
        ) : null}
      </Card>

      {/* Opportunity Information + Deal Value / Timeline. */}
      <section aria-label={t('opportunityDetail.cardsLabel')} {...stylex.props(styles.cardsGrid)}>
        <Card variant="default" padding={0} xstyle={styles.infoCard}>
          <h3 {...stylex.props(styles.sectionLabel)}>{t('opportunityDetail.information')}</h3>
          <div {...stylex.props(styles.infoGrid)}>
            <InfoField label={t('opportunityColumns.type')}>
              <span {...stylex.props(styles.fieldValueRow)}>
                <Icon
                  name={OPPORTUNITY_TYPE_ICONS[opportunity.type]}
                  {...stylex.props(styles.metaIcon)}
                />
                {t(`opportunityType.${opportunity.type}`)}
              </span>
            </InfoField>
            <InfoField label={t('opportunityColumns.member')}>{opportunity.member.name}</InfoField>
            <InfoField label={t('opportunityForm.description')}>
              {opportunity.description || '—'}
            </InfoField>
            <InfoField label={t('columns.assignedTo')}>
              {opportunity.assignedTo?.name ?? t('list.unassigned')}
            </InfoField>
            <InfoField label={t('opportunityColumns.expectedClose')}>
              {formatDate(opportunity.expectedCloseDate, locale)}
            </InfoField>
            <InfoField label={t('opportunityForm.probability')}>
              {`${opportunity.probability}%`}
            </InfoField>
          </div>
        </Card>

        <div {...stylex.props(styles.sideStack)}>
          <Card variant="default" padding={0} xstyle={styles.dealCard}>
            <h3 {...stylex.props(styles.sectionLabel)}>{t('opportunityDetail.dealValue')}</h3>
            <div {...stylex.props(styles.dealRow)}>
              <div {...stylex.props(styles.dealLeft)}>
                <span {...stylex.props(styles.dealIcon)}>
                  <Icon name="card" {...stylex.props(styles.dealIconSvg)} />
                </span>
                <p {...stylex.props(styles.dealLabel)}>{t('opportunityDetail.totalValue')}</p>
              </div>
              <p {...stylex.props(styles.dealValue)}>{formatMoney(opportunity.value)}</p>
            </div>
            <div {...stylex.props(styles.dealRow)}>
              <div {...stylex.props(styles.dealLeft)}>
                <span {...stylex.props(styles.dealIcon)}>
                  <Icon name="target" {...stylex.props(styles.dealIconSvg)} />
                </span>
                <p {...stylex.props(styles.dealLabel)}>{t('opportunityForm.probability')}</p>
              </div>
              <p {...stylex.props(styles.dealValue)}>{`${opportunity.probability}%`}</p>
            </div>
            <div {...stylex.props(styles.weightedRow)}>
              <p {...stylex.props(styles.dealLabel)}>{t('opportunityDetail.weightedValue')}</p>
              <p {...stylex.props(styles.weightedValue)}>
                {formatMoney(weightedValue(opportunity.value, opportunity.probability))}
              </p>
            </div>
          </Card>
          <DealTimeline opportunity={opportunity} t={t} locale={locale} />
        </div>
      </section>

      <OpportunityTabs opportunity={opportunity} canManage={canManage} />
    </div>
  );
}
