import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Badge, Banner } from '@fit/ui-kit';
import { WEEKDAYS, WEEKDAY_LABELS, formatDayHours, type AdminGymRequest } from '@fit/types';
import { BackLink, Cap, Fact, Mono, OpsCard, PageHead, SectionTitle } from '@/components/ops';
import { ButtonLink } from '@/components/button-link';
import { ApiError, fetchGymRequest } from '@/lib/api';
import { onboardingUrl, tenantPortalUrl } from '@/lib/tenant-url';
import { requestDate, RequestStatus } from '../request-status';
import { RequestLinkCard } from './link-card';
import { RequestActions } from './request-actions';

export const metadata: Metadata = { title: 'Gym request | FormaCore SuperAdmin' };
export const dynamic = 'force-dynamic';

function Details({ request }: { request: AdminGymRequest }) {
  const { business, brand, location, payments } = request.values;
  const draft = !request.submittedAt;
  return (
    <section className="ops-request-stack">
      <SectionTitle aside={draft ? <Badge label="Draft" tone="neutral" /> : undefined}>
        Submitted details
      </SectionTitle>
      <OpsCard>
        <div className="ops-request-stack">
          <Cap>Owner</Cap>
          <div className="ops-request-details">
            <Fact label="Name" value={request.ownerName || '—'} />
            <Fact label="Email" value={request.ownerEmail} />
          </div>
          <Cap>Business</Cap>
          <div className="ops-request-details">
            <Fact label="Gym name" value={business.gymName || '—'} />
            <Fact label="Address" value={business.address || '—'} />
            <Fact label="Phone" value={business.phone || '—'} />
            <Fact label="Contact email" value={business.email || '—'} />
            <Fact label="Website" value={business.website || '—'} />
          </div>
          <Cap>Brand</Cap>
          <div className="ops-request-row">
            <span
              className="ops-request-swatch"
              style={{ backgroundColor: brand.primaryColor }}
              aria-hidden="true"
            />
            <Mono>{brand.primaryColor}</Mono>
          </div>
          <Cap>First branch</Cap>
          <div className="ops-request-details">
            <Fact label="Name" value={location.name || '—'} />
            <Fact label="Address" value={location.address || '—'} />
            <Fact label="Phone" value={location.phone || '—'} />
          </div>
          <dl className="ops-request-hours">
            {WEEKDAYS.map((day) => (
              <div key={day}>
                <dt>{WEEKDAY_LABELS[day]}</dt>
                <dd>
                  <Mono>{formatDayHours(location.hours[day])}</Mono>
                </dd>
              </div>
            ))}
          </dl>
          <Cap>Payments</Cap>
          <div className="ops-request-details">
            {(
              [
                ['Cash', payments.acceptCash],
                ['Card', payments.acceptCard],
                ['Bank transfer', payments.acceptBankTransfer],
                ['Prepaid credits', payments.acceptPrepaidCredits],
              ] as const
            ).map(([label, enabled]) => (
              <Fact
                key={label}
                label={label}
                value={
                  <Badge label={enabled ? 'On' : 'Off'} tone={enabled ? 'positive' : 'neutral'} />
                }
              />
            ))}
          </div>
        </div>
      </OpsCard>
    </section>
  );
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let request: AdminGymRequest;
  try {
    request = await fetchGymRequest(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <div className="ops-request-stack">
        <BackLink href="/requests" label="Requests" />
        <Banner tone="error">
          {error instanceof ApiError
            ? `Could not load this request (${error.status}): ${error.message}`
            : 'Could not reach the FormaCore API.'}
        </Banner>
      </div>
    );
  }
  const host =
    tenantPortalUrl(request.subdomainSlug)?.replace(/^https?:\/\//, '') ?? request.subdomainSlug;
  const showLink = ['PENDING', 'IN_PROGRESS', 'CODE_SENT', 'EXPIRED'].includes(request.status);
  const canReject = request.status !== 'APPROVED' && request.status !== 'REJECTED';
  return (
    <div className="ops-request-stack">
      <PageHead
        eyebrow={<BackLink href="/requests" label="Requests" />}
        title={
          <>
            {request.gymName}
            <RequestStatus status={request.status} />
          </>
        }
        description={<Mono className="ops-request-host">{host}</Mono>}
        actions={
          request.status === 'APPROVED' && request.gymId ? (
            <ButtonLink href={`/gyms/${request.gymId}`} label="Open gym →" />
          ) : canReject ? (
            <RequestActions request={request} host={host} />
          ) : undefined
        }
      />
      {request.status === 'REJECTED' ? (
        <Banner tone="info">
          Rejected on {requestDate(request.decidedAt)}.{' '}
          {request.rejectionReason || 'No reason provided.'}
        </Banner>
      ) : null}
      <OpsCard>
        <div className="ops-request-facts">
          <Fact label="Created" value={<Mono>{requestDate(request.createdAt)}</Mono>} />
          <Fact label="Started" value={<Mono>{requestDate(request.startedAt)}</Mono>} />
          <Fact label="Code sent" value={<Mono>{requestDate(request.codeSentAt)}</Mono>} />
          <Fact label="Submitted" value={<Mono>{requestDate(request.submittedAt)}</Mono>} />
          <Fact label="Decided" value={<Mono>{requestDate(request.decidedAt)}</Mono>} />
        </div>
      </OpsCard>
      <div className={showLink ? 'ops-request-columns' : 'ops-request-stack'}>
        {showLink ? (
          <section className="ops-request-stack">
            <SectionTitle>Link</SectionTitle>
            <RequestLinkCard
              key={request.token ?? request.status}
              requestId={request.id}
              slug={request.subdomainSlug}
              request={request}
              url={request.token ? onboardingUrl(request.token) : null}
            >
              <Fact label="Expires" value={<Mono>{requestDate(request.expiresAt)}</Mono>} />
              {request.status === 'EXPIRED' ? (
                <Banner tone="info">
                  This link has expired. Regenerate it so the owner can continue.
                </Banner>
              ) : null}
            </RequestLinkCard>
          </section>
        ) : null}
        {request.completedSteps > 0 ? <Details request={request} /> : null}
      </div>
    </div>
  );
}
