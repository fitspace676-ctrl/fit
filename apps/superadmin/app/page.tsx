import { redirect } from 'next/navigation';

/**
 * The console's home is the gyms roster — there is no separate landing. The
 * SUPER_ADMIN gate has already run in `middleware.ts` by the time this renders,
 * so a reachable request is always an operator; send them straight to `/gyms`.
 */
export default function HomePage() {
  redirect('/gyms');
}
