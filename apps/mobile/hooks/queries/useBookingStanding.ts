import { useQuery } from '@tanstack/react-query';
import { getBookingStanding } from '../../lib/api/bookings';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { useSession } from '../useSession';
export function useBookingStanding() {
  const gymId = useGymId();
  const signedIn = useSession().status === 'signed-in';
  return useQuery({
    queryKey: [...queryKeys.bookings(gymId ?? ''), 'standing'],
    queryFn: ({ signal }) => getBookingStanding({ signal }),
    enabled: !!gymId && signedIn,
    retry: false,
  });
}
