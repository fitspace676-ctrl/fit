import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DoorFrame } from '@/components/door-frame';
import { OnboardingWizard } from './onboarding-wizard';

export const metadata: Metadata = {
  title: 'Gym setup',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, t] = await Promise.all([params, getTranslations('admin.onboarding')]);
  return (
    <DoorFrame title={t('title')} subtitle={t('subtitle')} footer={t('footer')}>
      <OnboardingWizard token={token} />
    </DoorFrame>
  );
}
