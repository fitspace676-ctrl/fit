import { z } from 'zod';
import { createPtSessionSchema, listAdminPtSessionsQuerySchema } from '@fit/types';
import { listOf, slimPtSession } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/classes/pt-sessions.controller.ts. */
export const ptSessionsTools = defineTools('classes', [
  {
    name: 'list_pt_sessions',
    project: listOf(slimPtSession, 'sessions'),
    title: 'List PT sessions',
    titleKa: 'PT სესიების სია',
    description:
      'List personal-training sessions starting in a from/to window, for all trainers or one trainerId: trainer, status, start, duration, class type and branch. Catalogue appointments use list_service_sessions.',
    method: 'get',
    path: '/admin/pt-sessions',
    query: listAdminPtSessionsQuerySchema,
  },
  {
    name: 'create_pt_session',
    title: 'Create PT session',
    titleKa: 'PT სესიის დაჯავშნა',
    description:
      'Schedule one personal-training session for a trainer and class type at startsAt for a duration. Returns the created session; trainerId from list_trainers.',
    method: 'post',
    path: '/admin/pt-sessions',
    destructive: false,
    body: createPtSessionSchema,
  },
  {
    name: 'cancel_pt_session',
    title: 'Cancel PT session',
    titleKa: 'PT სესიის გაუქმება',
    description:
      'Cancel a scheduled personal-training session, keeping it in history, and return its new status. Use complete_pt_session when it took place.',
    method: 'post',
    path: '/admin/pt-sessions/:id/cancel',
    destructive: true,
    params: id,
  },
  {
    name: 'complete_pt_session',
    title: 'Complete PT session',
    titleKa: 'PT სესიის დასრულება',
    description:
      'Mark a personal-training session as completed and return its new status. Use cancel_pt_session when it did not happen.',
    method: 'post',
    path: '/admin/pt-sessions/:id/complete',
    destructive: false,
    params: id,
  },
]);
