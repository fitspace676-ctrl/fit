// @fit/mobile — the class schedule (`/class-instances`).
//
// All three routes are `@Public()` and scoped by an explicit `gymId` query
// parameter rather than by the session, because the same endpoints serve the
// gym's public web site. The app still passes the session's gym id (from
// `useActiveGym`), never a remembered slug — see `lib/query-keys.ts` on why the
// tenant must have exactly one source.

import type {
  GetClassInstanceResponse,
  ListClassInstancesQuery,
  ListClassInstancesResponse,
} from '@fit/types';
import { apiJson, buildUrl } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/** The window + tenant a schedule read is scoped by. */
export type ListClassesParams = ListClassInstancesQuery;

/**
 * `GET /class-instances` — the occurrences overlapping `[from, to]`, ordered by
 * `startsAt`.
 *
 * `from` / `to` are ISO-8601 instants and the server rejects an inverted range
 * with a `400` (`listClassInstancesQuerySchema` refines it), so a caller that
 * lets a date picker produce `to < from` gets an error rather than a silently
 * empty week.
 */
export async function listClasses(
  params: ListClassesParams,
  options: FetchOptions = {},
): Promise<ListClassInstancesResponse> {
  return apiJson<ListClassInstancesResponse>(endpointPath(ENDPOINTS.listClasses), {
    method: ENDPOINTS.listClasses.method,
    query: { gymId: params.gymId, from: params.from, to: params.to, view: params.view },
    signal: options.signal,
  });
}

/**
 * `GET /class-instances/:id` — one occurrence's full detail.
 *
 * `gymId` is required even though the id is unique: an occurrence from another
 * tenant resolves to a `404`, identical to an unknown id, so a leaked id
 * discloses nothing.
 */
export async function getClass(
  params: { classId: string; gymId: string },
  options: FetchOptions = {},
): Promise<GetClassInstanceResponse> {
  return apiJson<GetClassInstanceResponse>(
    endpointPath(ENDPOINTS.getClass, { id: params.classId }),
    {
      method: ENDPOINTS.getClass.method,
      query: { gymId: params.gymId },
      signal: options.signal,
    },
  );
}

/**
 * The absolute URL of the live occupancy feed
 * (`GET /class-instances/occupancy/stream?gymId=…`).
 *
 * A **URL, not a request**: the route is a Nest `@Sse()` handler answering
 * `text/event-stream`, which `fetch` cannot consume incrementally on Hermes. The
 * screen layer opens it with `react-native-sse`'s `EventSource`. It still comes
 * from {@link ENDPOINTS} so the route table remains the only place a path is
 * written, and so the manifest checker sees it.
 *
 * Note this module cannot open the socket itself: `react-native-sse` is a React
 * Native module, and nothing under `lib/` may import one (§5).
 */
export function classOccupancyStreamUrl(gymId: string): string {
  return buildUrl(endpointPath(ENDPOINTS.streamClassOccupancy), { gymId });
}
