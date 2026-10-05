import { z } from 'zod';
import { createServiceSessionSchema, listAdminServiceSessionsQuerySchema } from '@fit/types';
import { listOf, slimServiceSession } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/services/service-sessions.controller.ts. */
export const serviceSessionsTools = defineTools('services', [
  {
    name: 'list_service_sessions',
    project: listOf(slimServiceSession, 'sessions'),
    title: 'List service sessions',
    titleKa: 'სერვისის სესიების სია',
    description:
      'List catalogue-service appointments in a window: service, status, start, staff, booked member and branch. Use for massage and other service bookings; PT calendar sessions use list_pt_sessions.',
    method: 'get',
    path: '/admin/service-sessions',
    query: listAdminServiceSessionsQuerySchema,
  },
  {
    name: 'create_service_session',
    title: 'Create service session',
    titleKa: 'სერვისის სესიის დაჯავშნა',
    description:
      'Open one bookable appointment slot for a catalogue service at startsAt, with optional notes. Returns the slot; serviceId comes from list_services.',
    method: 'post',
    path: '/admin/service-sessions',
    destructive: false,
    body: createServiceSessionSchema,
  },
  {
    name: 'cancel_service_session',
    title: 'Cancel service session',
    titleKa: 'სერვისის სესიის გაუქმება',
    description:
      'Cancel a catalogue-service appointment and return its updated state. Use complete_service_session instead when it took place.',
    method: 'post',
    path: '/admin/service-sessions/:id/cancel',
    destructive: true,
    params: id,
  },
  {
    name: 'complete_service_session',
    title: 'Complete service session',
    titleKa: 'სერვისის სესიის დასრულება',
    description:
      'Mark a catalogue-service appointment as delivered and return its updated state. Use cancel_service_session when it did not happen.',
    method: 'post',
    path: '/admin/service-sessions/:id/complete',
    destructive: false,
    params: id,
  },
]);
