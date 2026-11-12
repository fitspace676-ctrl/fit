import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OnboardingWizard } from './onboarding-wizard';

export const metadata: Metadata = {
  title: 'Gym setup',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense fallback={null}>
      <OnboardingWizard token={token} />
    </Suspense>
  );
}
