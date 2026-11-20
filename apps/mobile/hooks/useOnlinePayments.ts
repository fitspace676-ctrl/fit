import { useGymBySlug } from './queries/useGym';
import { useGymId } from './useActiveGym';
import { resolveGymSlug } from '../lib/auth/session';
import { canPayOnline } from '../lib/payment-flow';

/** Read capability even when signed in, but never use another gym's config. */
export function useOnlinePayments() {
  const gymId = useGymId();
  const query = useGymBySlug(resolveGymSlug());
  const onlinePayments =
    gymId && query.data?.gymId !== gymId ? undefined : query.data?.onlinePayments;
  return { onlinePayments, enabled: canPayOnline(onlinePayments), isPending: query.isPending };
}
