import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DoorFrame } from '@/components/door-frame';
import { ForgotPasswordForm } from './forgot-password-form';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <DoorFrame title={t('forgot.title')} subtitle={t('forgot.subtitle')}>
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
      <Link href="/login">{t('forgot.backToLogin')}</Link>
    </DoorFrame>
  );
}
