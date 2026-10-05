import { z } from 'zod';
import {
  checkInStatsQuerySchema,
  listTodayCheckInsQuerySchema,
  recordCheckInSchema,
} from '@fit/types';
import { listOf, slimCheckIn } from './projections';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/check-in/check-in.controller.ts. */
export const checkInTools = defineTools('members', [
  {
    name: 'record_checkin',
    title: 'Record check-in',
    titleKa: 'ჩექინის დაფიქსირება',
    description:
      "Record a member's front-desk arrival by gymMemberId, at locationId or the default branch. Returns the check-in and the member's access eligibility; use mark_attendance for class rosters.",
    method: 'post',
    path: '/admin/check-ins',
    destructive: false,
    body: recordCheckInSchema,
  },
  {
    name: 'list_today_checkins',
    project: listOf(slimCheckIn, 'checkIns'),
    title: 'List today check-ins',
    titleKa: 'დღევანდელი ჩექინები',
    description:
      "List today's front-desk arrivals, optionally for one branch: member id and name, method, branch and time. Use checkin_stats for counts and get_attendance for class attendance.",
    method: 'get',
    path: '/admin/check-ins/today',
    query: listTodayCheckInsQuerySchema,
  },
  {
    name: 'checkin_stats',
    core: true,
    title: 'Check-in stats',
    titleKa: 'ჩექინის სტატისტიკა',
    description:
      "Today's reception numbers: checked in today, in the gym now, peak and no-shows, for the gym or one branch. Use for 'how busy are we' questions; list_today_checkins gives the names.",
    method: 'get',
    path: '/admin/check-ins/stats',
    query: checkInStatsQuerySchema,
  },
  {
    name: 'get_checkin_eligibility',
    title: 'Get check-in eligibility',
    titleKa: 'ჩექინის უფლების შემოწმება',
    description:
      'Check whether a member may enter right now: access standing, reason and current plan. Use before record_checkin when access is in doubt.',
    method: 'get',
    path: '/admin/check-ins/eligibility',
    query: z.object({ gymMemberId: z.string().min(1) }),
  },
]);
