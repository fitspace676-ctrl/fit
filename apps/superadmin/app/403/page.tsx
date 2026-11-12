import type { Metadata } from 'next';
import { Badge } from '@fit/ui-kit';
import { SignOutButton } from '@/components/sign-out-button';

export const metadata: Metadata = {
  title: 'Access denied | FormaCore SuperAdmin',
  description: 'This console is restricted to platform operators.',
};

export default function ForbiddenPage() {
  return (
    <main className="ops-auth">
      <section className="ops-auth-card ops-auth-denied">
        <Badge label="403" tone="danger" />
        <h1>Access denied</h1>
        <p>
          This console is restricted to platform operators. You are signed in, but this account is
          not one.
        </p>
        <div>
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
