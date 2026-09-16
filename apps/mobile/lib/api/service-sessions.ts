// @fit/mobile — personal training: the service catalogue, its open slots, and
// the caller's booked sessions.
//
// `apps/api/src/services/service-sessions.controller.ts` declares **three**
// controllers in one file, and only two of them are member-callable:
//
//   - `@Controller('admin/service-sessions')` — `ClassRead` / `ClassWrite`.
//     Staff only. Absent from `ENDPOINTS`; a member calling it gets a 403.
//   - `@Controller('service-sessions')`      — `@Public()`. The OPEN slots a
//     visitor can book, scoped by an explicit `gymId` + window.
//   - `@Controller('me/service-sessions')`   — `ClassBook`. The caller's own
//     sessions, and the booking action.
//
// Booking a session **raises an invoice** (`memberServiceSessionSchema.invoice`),
// and the member's invoice history is part of `GET /me/subscription` — so
// `bookServiceSession` invalidates `queryKeys.membership(gymId)` too. That is
// not an obvious edge; it is why the matrix is a table and not a habit.

import type {
  BookServiceSessionResult,
  ListMemberServiceSessionsResponse,
  ListServiceSlotsQuery,
  ListServiceSlotsResponse,
  ListServicesResponse,
} from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * `GET /services?gymId` — the gym's ACTIVE services (the PT catalogue).
 *
 * Public and scoped by an explicit `gymId`, exactly like `/trainers` and
 * `/products`: the gym's own site serves it to visitors with no session.
 */
export async function listServices(
  params: { gymId: string },
  options: FetchOptions = {},
): Promise<ListServicesResponse> {
  return apiJson<ListServicesResponse>(endpointPath(ENDPOINTS.listServices), {
    method: ENDPOINTS.listServices.method,
    query: { gymId: params.gymId },
    signal: options.signal,
  });
}

/**
 * `GET /service-sessions?gymId&serviceId?&from&to` — bookable OPEN slots.
 *
 * The window is required and bounded server-side (`MAX_SCHEDULE_WINDOW_DAYS`);
 * an inverted or over-long range is a `400`, not an empty list. Omitting
 * `serviceId` returns every service's slots, which is what a "what's free this
 * week" view wants.
 */
export async function listServiceSlots(
  params: ListServiceSlotsQuery,
  options: FetchOptions = {},
): Promise<ListServiceSlotsResponse> {
  return apiJson<ListServiceSlotsResponse>(endpointPath(ENDPOINTS.listServiceSlots), {
    method: ENDPOINTS.listServiceSlots.method,
    query: {
      gymId: params.gymId,
      serviceId: params.serviceId,
      from: params.from,
      to: params.to,
    },
    signal: options.signal,
  });
}

/**
 * `GET /me/service-sessions` — the caller's sessions, each with the invoice it
 * raised.
 *
 * No filters: the member is the session, and the list is small enough that the
 * API returns it whole.
 */
export async function listMyServiceSessions(
  options: FetchOptions = {},
): Promise<ListMemberServiceSessionsResponse> {
  return apiJson<ListMemberServiceSessionsResponse>(endpointPath(ENDPOINTS.listMyServiceSessions), {
    method: ENDPOINTS.listMyServiceSessions.method,
    signal: options.signal,
  });
}

/**
 * `POST /me/service-sessions/:id/book` — claim an OPEN slot.
 *
 * The slot flips `OPEN → BOOKED` (so the public slot list is stale) and an
 * invoice is minted (so the membership screen's billing history is stale).
 * Answers `200` with the booked session, not `201`.
 */
export async function bookServiceSession(
  input: { sessionId: string },
  options: FetchOptions = {},
): Promise<BookServiceSessionResult> {
  return apiJson<BookServiceSessionResult>(
    endpointPath(ENDPOINTS.bookServiceSession, { id: input.sessionId }),
    {
      method: ENDPOINTS.bookServiceSession.method,
      signal: options.signal,
    },
  );
}
