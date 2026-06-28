import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterGymForm } from '@/components/signup/register-gym-form';

export const metadata: Metadata = {
  title: 'Create your gym - Fit',
  description: 'Set up your gym on Fit in minutes. No credit card required to start.',
};

/**
 * Owner-signup page (`/register-gym`) — the conversion endpoint every marketing
 * CTA points at. A centred single-column card so the form is the sole focus; the
 * brand wordmark links back to the homepage. The form itself ({@link
 * RegisterGymForm}) is the only client component on this surface.
 */
export default function RegisterGymPage() {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto w-full max-w-6xl px-gutter py-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand-600">
          Fit
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-gutter py-10">
        <div className="w-full max-w-md rounded-card border border-slate-100 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your gym</h1>
            <p className="mt-2 text-sm text-slate-500">
              Get your branded gym site up and running in minutes.
            </p>
          </div>
          <RegisterGymForm />
        </div>
      </div>
    </main>
  );
}
