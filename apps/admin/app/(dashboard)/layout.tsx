import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { getActiveGymSlug } from '@/lib/active-gym';

/**
 * Authenticated console layout. Every page under this route group renders inside
 * the {@link AdminShell} (sidebar + top bar). The active gym slug is resolved on
 * the server from the request host and handed to the shell for display.
 *
 * Public pages (`/403`, the sign-in flow) live outside this group, so they render
 * on the bare root layout with no console chrome. `middleware.ts` has already
 * authenticated and role-gated the request before anything here renders.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const gymSlug = await getActiveGymSlug();
  return <AdminShell gymSlug={gymSlug}>{children}</AdminShell>;
}
