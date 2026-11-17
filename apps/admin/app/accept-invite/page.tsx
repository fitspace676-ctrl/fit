import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { DoorFrame } from '@/components/door-frame';
import { InviteForm } from './invite-form';

export const metadata = { robots: { index: false, follow: false } };

export default async function InvitePage() {
  const t = await getTranslations('admin.invite');
  return (
    <DoorFrame title={t('title')} subtitle={t('subtitle')} footer={t('footer')}>
      <Suspense fallback={null}>
        <InviteForm />
      </Suspense>
    </DoorFrame>
  );
}
