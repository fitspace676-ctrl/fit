// @fit/mobile — the home carousel's slides (`/banners`).
//
// One route, and it is `@Public()` in the same sense `GET /trainers` is: the
// gym is named by an explicit `gymId` the app resolves from its configured
// slug, and no session is involved. `anonymous: true` is therefore not an
// optimisation — the request is made on Home's first render, where the access
// token may still be hydrating, and sending a half-loaded Authorization header
// into a route that ignores it is how a marketing block ends up gated behind a
// refresh.
//
// The API has already decided WHICH banners exist: parked rows, rows with no
// artwork, and rows outside their schedule window are filtered server-side, and
// the order is `sortOrder` then `createdAt`. There is nothing left for the
// client to filter or sort, and an empty array is a normal answer.

import type { ListPublicBannersResponse } from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/** `GET /banners?gymId` — the gym's live banners, in carousel order. */
export async function listBanners(
  params: { gymId: string },
  options: FetchOptions = {},
): Promise<ListPublicBannersResponse> {
  return apiJson<ListPublicBannersResponse>(endpointPath(ENDPOINTS.listBanners), {
    method: ENDPOINTS.listBanners.method,
    query: { gymId: params.gymId },
    anonymous: true,
    signal: options.signal,
  });
}
