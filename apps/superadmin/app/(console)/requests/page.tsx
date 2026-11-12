import type { Metadata } from 'next';
import { Banner } from '@fit/ui-kit';
import { PageHead } from '@/components/ops';
import { ButtonLink } from '@/components/button-link';
import { ApiError, fetchGymRequests } from '@/lib/api';
import { RequestsTable } from './requests-table';

export const metadata: Metadata = { title: 'Requests | FormaCore SuperAdmin' };
export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  let content;
  try {
    const { requests } = await fetchGymRequests();
    content = <RequestsTable requests={requests} />;
  } catch (error) {
    content = (
      <Banner tone="error">
        {error instanceof ApiError
          ? `Could not load requests (${error.status}): ${error.message}`
          : 'Could not reach the FormaCore API.'}
      </Banner>
    );
  }
  return (
    <div className="ops-request-stack">
      <PageHead
        title="Requests"
        description="Owner onboarding requests. Review confirmed details and approve a gym when it is ready."
        actions={<ButtonLink href="/gyms/new" label="New gym request" />}
      />
      {content}
    </div>
  );
}
