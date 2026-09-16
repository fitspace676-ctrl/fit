// @fit/mobile — Home's promotional carousel.
//
// Gym-scoped and gated like every other query here, even though `GET /banners`
// needs no session: the reel belongs to one tenant, and `gymScope` is what keeps
// it in that tenant's bucket.
//
// FIVE MINUTES STALE, and the number is a decision rather than a default. A
// banner is a marketing asset a gym edits in the console a few times a season,
// and Home re-mounts on every tab switch — refetching a campaign list on each of
// those is a request per tab press for a picture that has not changed. Long
// enough that the carousel is instant on the second visit, short enough that a
// gym that just published a campaign sees it within one coffee.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { ListPublicBannersResponse } from '@fit/types';
import { listBanners } from '../../lib/api/banners';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** How long a fetched reel is served without a refetch. See the header. */
export const BANNERS_STALE_MS = 5 * 60_000;

/** Options for `GET /banners`. */
export function bannersQueryOptions(
  gymId: string | null,
): UseQueryOptions<ListPublicBannersResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.banners(scope.gymId),
    queryFn: ({ signal }) => listBanners({ gymId: scope.gymId }, { signal }),
    enabled: scope.enabled,
    staleTime: BANNERS_STALE_MS,
  };
}

/** The gym's live home banners, in carousel order. */
export function useBanners() {
  return useQuery(bannersQueryOptions(useGymId()));
}
