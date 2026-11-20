import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ApiError, fetchIntegrations } from '@/lib/api';
import { getServerSession } from '@/lib/session';
import { IntegrationsForm } from './integrations-form';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  if ((await getServerSession())?.role !== 'OWNER') redirect('/403');
  const t = await getTranslations('admin.integrations');
  let integrations;
  try {
    integrations = await fetchIntegrations();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) redirect('/403');
    return (
      <div>
        <h1>{t('title')}</h1>
        <p role="alert">{t('errors.unreachable')}</p>
      </div>
    );
  }
  const flitt = integrations.find((item) => item.provider === 'flitt');
  if (!flitt) return <p role="alert">{t('errors.unexpected')}</p>;
  const sender = integrations.find((item) => item.provider === 'sender') ?? {
    provider: 'sender' as const,
    connected: false,
    enabled: false,
    merchantId: null,
    secretHint: null,
    verifiedAt: null,
    lastError: null,
    testMode: false,
  };
  return <IntegrationsForm initial={flitt} sender={sender} />;
}
