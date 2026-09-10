import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DoorFrame } from '@/components/door-frame';
import { StaffLoginForm } from './staff-login-form';

export const metadata: Metadata = {
  title: 'Staff sign in - FormaCore',
  description: 'Sign in to the FormaCore staff console.',
};

/**
 * The console's sign-in (`/admin/login`), on the shared {@link DoorFrame} - the
 * same two-column photograph-and-form frame the owner activation page uses, so
 * every way into the console reads as one product.
 *
 * Staff accounts are provisioned by invitation from the console itself, so
 * there is no "create an account" here; that fact is the form's footer line.
 * Password recovery is the member site's reset flow, which sets the same
 * session - the field-level "forgot?" link points there.
 */
export default async function AdminLoginPage() {
  const t = await getTranslations('admin.login');

  return (
    <DoorFrame title={t('title')} footer={t('invitation')}>
      {/* `useSearchParams` (the `?from` return path, the post-activation banner)
          needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <StaffLoginForm />
      </Suspense>
    </DoorFrame>
  );
}
