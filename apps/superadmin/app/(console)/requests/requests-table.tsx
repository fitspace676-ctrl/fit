'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminGymRequestSummary } from '@fit/types';
import { EmptyState, type Column } from '@fit/ui-kit';
import { Cap, FilterPills, Mono, OpsTable } from '@/components/ops';
import { requestDate, RequestStatus } from './request-status';

type Filter = 'approval' | 'progress' | 'closed' | 'all';
function matches(request: AdminGymRequestSummary, filter: Filter) {
  if (filter === 'approval') return request.status === 'SUBMITTED';
  if (filter === 'progress')
    return ['PENDING', 'IN_PROGRESS', 'CODE_SENT'].includes(request.status);
  if (filter === 'closed') return ['APPROVED', 'REJECTED', 'EXPIRED'].includes(request.status);
  return true;
}
const columns: ReadonlyArray<Column<AdminGymRequestSummary>> = [
  {
    key: 'gym',
    header: 'Gym',
    cell: (request) => (
      <div className="ops-request-cell">
        <Link className="ops-request-name" href={`/requests/${request.id}`}>
          {request.gymName}
        </Link>
        <Mono>{request.subdomainSlug}</Mono>
      </div>
    ),
  },
  {
    key: 'owner',
    header: 'Owner',
    cell: (request) => (
      <div className="ops-request-cell">
        <span>{request.ownerName ?? '—'}</span>
        <span className="ops-request-secondary">{request.ownerEmail}</span>
      </div>
    ),
  },
  { key: 'status', header: 'Status', cell: (request) => <RequestStatus status={request.status} /> },
  {
    key: 'steps',
    header: 'Steps',
    cell: (request) => (
      <Mono>
        {request.completedSteps}/{request.totalSteps}
      </Mono>
    ),
  },
  {
    key: 'created',
    header: 'Created',
    cell: (request) => <Mono>{requestDate(request.createdAt)}</Mono>,
  },
  {
    key: 'date',
    header: 'Timeline',
    cell: (request) => (
      <div className="ops-request-cell">
        <Cap>{request.decidedAt ? 'Decided' : request.submittedAt ? 'Submitted' : 'Expires'}</Cap>
        <Mono>{requestDate(request.decidedAt ?? request.submittedAt ?? request.expiresAt)}</Mono>
      </div>
    ),
  },
];

export function RequestsTable({ requests }: { requests: AdminGymRequestSummary[] }) {
  const [filter, setFilter] = useState<Filter>(() =>
    requests.some((request) => matches(request, 'approval')) ? 'approval' : 'all',
  );
  const options: { value: Filter; label: string }[] = [
    { value: 'approval', label: 'Needs approval' },
    { value: 'progress', label: 'In progress' },
    { value: 'closed', label: 'Closed' },
    { value: 'all', label: 'All' },
  ];
  return (
    <div className="ops-request-stack">
      <FilterPills
        label="Request status"
        value={filter}
        onChange={setFilter}
        options={options.map((option) => ({
          ...option,
          label: `${option.label} · ${requests.filter((request) => matches(request, option.value)).length}`,
        }))}
      />
      <OpsTable
        columns={columns}
        rows={requests.filter((request) => matches(request, filter))}
        rowKey={(request) => request.id}
        caption="Gym onboarding requests"
        empty={
          <EmptyState
            title={requests.length ? 'No requests in this view' : 'No requests yet'}
            body={
              requests.length
                ? 'Choose another status to see more requests.'
                : 'Create a gym request to send an onboarding link to its owner.'
            }
          />
        }
      />
    </div>
  );
}
