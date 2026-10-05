import { z } from 'zod';
import { markAttendanceSchema } from '@fit/types';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/classes/attendance.controller.ts. */
export const attendanceTools = defineTools('classes', [
  {
    name: 'get_attendance',
    title: 'Get attendance',
    titleKa: 'დასწრების ნახვა',
    description:
      "Read a dated class's attendance roster: each booked member with attended/no-show status, seat totals and tallies. Use for class attendance; reception arrivals are in list_today_checkins.",
    method: 'get',
    path: '/admin/class-instances/:id/attendance',
    params: id,
  },
  {
    name: 'mark_attendance',
    title: 'Mark attendance',
    titleKa: 'დასწრების აღნიშვნა',
    description:
      'Mark booked members ATTENDED or NO_SHOW for a dated class in one call (bookingIds from get_attendance). Completes the class and returns the refreshed roster.',
    method: 'post',
    path: '/admin/class-instances/:id/attendance',
    destructive: false,
    body: markAttendanceSchema,
    params: id,
  },
]);
