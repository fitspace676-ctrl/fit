import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DoorFrame } from '@/components/door-frame';
import { ActivateForm } from './activate-form';

export const metadata: Metadata = {
  title: 'Set your password - FormaCore',
  description: 'Finish setting up your gym on FormaCore.',
  // Nothing here should ever be indexed: the page is only meaningful with a
  // single-use token in the query, and a crawler following one would burn it.
  robots: { index: false, follow: false },
};

/**
 * Where a gym owner's onboarding email lands (`/admin/activate?token=…`).
 *
 * The link used to point at the API's `GET /auth/verify`, which answered a
 * browser with a JSON token pair - the owner's first sight of the product was a
 * page of JSON, and if the operator console had provisioned the gym without a
 * password (which is what its form does) there was no way on from there at all.
 * This page closes that: one request verifies the address and sets the first
 * password, and the owner is handed to the sign-in with their email filled in.
 *
 * Public by way of `middleware.ts`'s `PUBLIC_PATHS`, and rendered outside the
 * `(dashboard)` route group - the person reading it has no session yet, which is
 * the entire reason they are here.
 */
export default async function ActivatePage() {
  const t = await getTranslations('admin.activate');

  return (
    <DoorFrame title={t('title')} subtitle={t('subtitle')} footer={t('footer')}>
      {/* `useSearchParams` (the `?token`) needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <ActivateForm />
      </Suspense>
    </DoorFrame>
  );
}
