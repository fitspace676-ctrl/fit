import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DoorFrame } from '@/components/door-frame';
import { ResetPasswordForm } from './reset-password-form';

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <DoorFrame title={t('reset.title')} subtitle={t('reset.subtitle')}>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
      <Link href="/login">{t('reset.backToLogin')}</Link>
    </DoorFrame>
  );
}
