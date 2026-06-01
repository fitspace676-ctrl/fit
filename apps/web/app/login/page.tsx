import type { Metadata } from 'next';
import { AppleSignInButton } from './apple-sign-in-button';
import { GoogleSignInButton } from './google-sign-in-button';

export const metadata: Metadata = {
  title: 'Sign in — Fit',
  description: 'Sign in to your Fit account.',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-gutter text-center">
      <h1 className="text-3xl font-bold tracking-tight text-brand-600">Sign in to Fit</h1>
      <p className="max-w-sm text-slate-500">
        Continue with your Google or Apple account to get started.
      </p>
      <GoogleSignInButton />
      <AppleSignInButton />
    </main>
  );
}
