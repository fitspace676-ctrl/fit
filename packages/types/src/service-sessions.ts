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

/** Query for `GET /admin/service-sessions` — the calendar feed. */
export const listAdminServiceSessionsQuerySchema = windowRefine(
  z.object({
    ...windowFields,
    staffId: z.string().min(1).optional(),
    serviceId: z.string().min(1).optional(),
  }),
);
export type ListAdminServiceSessionsQuery = z.infer<typeof listAdminServiceSessionsQuerySchema>;

/** Body for `POST /admin/service-sessions` — open one slot of a service. */
export const createServiceSessionSchema = z.object({
  serviceId: z.string().min(1, 'Pick a service'),
  startsAt: z.string().datetime({ message: 'A valid start time is required' }),
  notes: z.string().trim().max(2000).default(''),
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
