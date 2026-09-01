// @fit/types — service sessions: the bookable slots of a Service
// (docs/superpowers/specs/2026-08-25-services-design.md, stage 2 + 3).
//
// Staff open slots on the PT calendar (`POST /admin/service-sessions`); the
// member portal lists the OPEN ones (`GET /service-sessions`, public) and a
// member books one (`POST /me/service-sessions/:id/book`), which raises a
// PENDING invoice for the service price. The three surfaces share these shapes.

import { z } from 'zod';
import { MAX_SCHEDULE_WINDOW_DAYS } from './schedule-admin';
import { serviceTypeSchema } from './services-admin';

const MAX_WINDOW_MS = MAX_SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export const serviceSessionStatusSchema = z.enum(['OPEN', 'BOOKED', 'COMPLETED', 'CANCELLED']);
export type ServiceSessionStatus = z.infer<typeof serviceSessionStatusSchema>;

/** A `[from, to)` window of at most {@link MAX_SCHEDULE_WINDOW_DAYS} days. */
const windowFields = {
  from: z.string().datetime(),
  to: z.string().datetime(),
};
const windowRefine = <T extends { from: string; to: string }>(schema: z.ZodType<T>) =>
  schema
    .refine((q) => new Date(q.from).getTime() <= new Date(q.to).getTime(), {
      message: 'from must be on or before to',
      path: ['from'],
    })
    .refine((q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= MAX_WINDOW_MS, {
      message: `The window cannot exceed ${MAX_SCHEDULE_WINDOW_DAYS} days`,
      path: ['to'],
    });

// ── Admin (PT calendar) ───────────────────────────────────────────────────────

/**
 * Query for `GET /admin/service-sessions` — the calendar feed.
 *
 * `locationId` narrows to the slots running at one branch, plain equality on
 * `ServiceSession.locationId`. **The PT calendar renders these blocks beside
 * `PtSession` blocks, so the two had to gain a branch together**: give one a filter
 * and not the other and a branch-filtered calendar is assembled from two
 * populations — the defect the trainer-performance report was held gym-wide to
 * avoid.
 *
 * Note what does NOT filter with it: the `Service` catalogue's own branch is
 * derived from its staff member's roster and is a statement about availability,
 * whereas this is one appointment at one door. A coach who moves branches does not
 * move the sessions they have already booked.
 */
export const listAdminServiceSessionsQuerySchema = windowRefine(
  z.object({
    ...windowFields,
    staffId: z.string().min(1).optional(),
    serviceId: z.string().min(1).optional(),
    locationId: z.string().min(1).optional(),
  }),
);
export type ListAdminServiceSessionsQuery = z.infer<typeof listAdminServiceSessionsQuerySchema>;

/**
 * Body for `POST /admin/service-sessions` — open one slot of a service.
 *
 * `locationId` is optional and resolved exactly as {@link createPtSessionSchema}
 * resolves its own: sent wins; otherwise a staff member rostered at exactly one
 * branch supplies the only possible answer; otherwise the slot is unattributed.
 * Never the gym default. Frozen at creation, like `staffId`, so reassigning the
 * service later never moves a slot a member has already booked — a past event does
 * not move because a person later did.
 */
export const createServiceSessionSchema = z.object({
  serviceId: z.string().min(1, 'Pick a service'),
  startsAt: z.string().datetime({ message: 'A valid start time is required' }),
  notes: z.string().trim().max(2000).default(''),
  locationId: z.string().min(1).optional(),
});
export type CreateServiceSessionInput = z.input<typeof createServiceSessionSchema>;
export type CreateServiceSessionData = z.infer<typeof createServiceSessionSchema>;

/** The invoice a booked session raised, as the calendar and the portal show it. */
export interface ServiceSessionInvoice {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';
}

/** One session as the admin PT calendar renders it. */
export interface AdminServiceSession {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceType: z.infer<typeof serviceTypeSchema>;
  /** The service's cover image, when it has one. */
  serviceCoverUrl: string | null;
  staffId: string;
  staffName: string;
  memberId: string | null;
  memberName: string | null;
  /**
   * The branch this slot runs at, and its name for the block's badge. Both `null`
   * for an unattributed slot, and for one whose branch was later closed — the
   * session still happened, so the row survives with no branch.
   */
  locationId: string | null;
  locationName: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: ServiceSessionStatus;
  invoice: ServiceSessionInvoice | null;
  notes: string;
}

export interface AdminServiceSessionsResponse {
  sessions: AdminServiceSession[];
}

// ── Public (portal calendar) ──────────────────────────────────────────────────

/** Query for the public `GET /service-sessions?gymId&serviceId?&from&to` — OPEN slots. */
export const listServiceSlotsQuerySchema = windowRefine(
  z.object({
    gymId: z.string().min(1),
    serviceId: z.string().min(1).optional(),
    ...windowFields,
  }),
);
export type ListServiceSlotsQuery = z.infer<typeof listServiceSlotsQuerySchema>;

/** One OPEN slot a visitor can book. Parsed client-side. */
export const serviceSlotSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  serviceName: z.string(),
  serviceType: serviceTypeSchema,
  staffName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number().int(),
  priceMinor: z.number().int(),
  currency: z.string(),
});
export type ServiceSlot = z.infer<typeof serviceSlotSchema>;

export const listServiceSlotsResultSchema = z.object({ slots: serviceSlotSchema.array() });
export interface ListServiceSlotsResponse {
  slots: ServiceSlot[];
}

// ── Member (`/me/service-sessions`) ───────────────────────────────────────────

export const serviceSessionInvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(['PAID', 'PENDING', 'FAILED', 'REFUNDED']),
});

/** One of the calling member's sessions, with the invoice it raised. */
export const memberServiceSessionSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  serviceName: z.string(),
  serviceType: serviceTypeSchema,
  staffName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: serviceSessionStatusSchema,
  invoice: serviceSessionInvoiceSchema.nullable(),
});
export type MemberServiceSession = z.infer<typeof memberServiceSessionSchema>;

export const listMemberServiceSessionsResultSchema = z.object({
  sessions: memberServiceSessionSchema.array(),
});
export interface ListMemberServiceSessionsResponse {
  sessions: MemberServiceSession[];
}

/** `POST /me/service-sessions/:id/book` — the booked session with its invoice. */
export const bookServiceSessionResultSchema = z.object({ session: memberServiceSessionSchema });
export type BookServiceSessionResult = z.infer<typeof bookServiceSessionResultSchema>;
