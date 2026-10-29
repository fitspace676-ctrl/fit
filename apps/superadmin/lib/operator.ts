import { isSuperAdmin } from './auth-session';
import { getServerSession } from './session';

/**
 * Re-assert SUPER_ADMIN inside a Server Action or route handler. The middleware
 * already gates every page, but an action is a POST endpoint in its own right
 * and `/api/*` sits outside the middleware's matcher, so each one checks again —
 * defence in depth, not a substitute for the gate.
 */
export async function requireOperator(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && isSuperAdmin(session.role);
}
