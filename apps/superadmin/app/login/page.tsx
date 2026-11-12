import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpsLogo } from '@/components/ops/logo';
import { OperatorLoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Operator sign in | FormaCore',
  description: 'Sign in to the FormaCore platform operator console.',
};

export default function OperatorLoginPage() {
  return (
    <main className="ops-auth">
      <section className="ops-auth-card">
        <div className="ops-auth-header">
          <OpsLogo sub="Operator console" size={40} />
          <div>
            <h1>Operator sign in</h1>
            <p>Platform administrators only. Every gym on FormaCore is managed from here.</p>
          </div>
        </div>
        <div className="ops-auth-body">
          <Suspense fallback={null}>
            <OperatorLoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
