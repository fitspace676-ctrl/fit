import { z } from 'zod';
import {
  createStaffNoteSchema,
  createStaffTaskSchema,
  createTimeOffRequestSchema,
  decideTimeOffRequestSchema,
  listTimeOffQuerySchema,
  updateStaffScheduleSchema,
  updateStaffTaskSchema,
  workingNowQuerySchema,
} from '@fit/types';
import { listOf, slimTimeOff } from './projections';
import { defineTools } from './shared';

const staffId = { staffId: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/staff/staff-depth.controller.ts. */
export const staffDepthTools = defineTools('staff', [
  {
    name: 'list_staff_roles',
    title: 'List staff roles',
    titleKa: 'პერსონალის როლები',
    description:
      'List the staff roles and the permissions each one grants. Use to explain what a role can do before update_staff_role.',
    method: 'get',
    path: '/staff/roles',
  },
  {
    name: 'list_staff_notes',
    title: 'List staff notes',
    titleKa: 'პერსონალის შენიშვნები',
    description:
      'List the internal notes kept on one staff member with author, text and date. staffId comes from list_staff.',
    method: 'get',
    path: '/staff/:staffId/notes',
    params: staffId,
  },
  {
    name: 'add_staff_note',
    title: 'Add staff note',
    titleKa: 'შენიშვნის დამატება პერსონალზე',
    description:
      'Add an internal note to a staff member and return the saved note. Use add_staff_task for work that needs doing.',
    method: 'post',
    path: '/staff/:staffId/notes',
    destructive: false,
    body: createStaffNoteSchema,
    params: staffId,
  },
  {
    name: 'delete_staff_note',
    title: 'Delete staff note',
    titleKa: 'პერსონალის შენიშვნის წაშლა',
    description: 'Permanently delete one staff note. Note ids come from list_staff_notes.',
    method: 'del',
    path: '/staff/notes/:noteId',
    destructive: true,
    params: { noteId: z.string().min(1) },
  },
  {
    name: 'list_staff_tasks',
    title: 'List staff tasks',
    titleKa: 'პერსონალის დავალებები',
    description:
      'List the tasks assigned to one staff member with title, due date and done state. Use update_staff_task to mark one done.',
    method: 'get',
    path: '/staff/:staffId/tasks',
    params: staffId,
  },
  {
    name: 'add_staff_task',
    title: 'Add staff task',
    titleKa: 'დავალების დამატება პერსონალზე',
    description:
      'Assign a task to a staff member and return the saved task. staffId comes from list_staff.',
    method: 'post',
    path: '/staff/:staffId/tasks',
    destructive: false,
    body: createStaffTaskSchema,
    params: staffId,
  },
  {
    name: 'update_staff_task',
    title: 'Update staff task',
    titleKa: 'პერსონალის დავალების განახლება',
    description:
      'Edit a staff task or mark it done and return the updated task. Task ids come from list_staff_tasks.',
    method: 'patch',
    path: '/staff/tasks/:taskId',
    destructive: false,
    body: updateStaffTaskSchema,
    params: { taskId: z.string().min(1) },
  },
  {
    name: 'delete_staff_task',
    title: 'Delete staff task',
    titleKa: 'პერსონალის დავალების წაშლა',
    description:
      'Permanently delete one staff task. Use update_staff_task to mark it done instead of deleting it.',
    method: 'del',
    path: '/staff/tasks/:taskId',
    destructive: true,
    params: { taskId: z.string().min(1) },
  },
  {
    name: 'list_time_off',
    project: listOf(slimTimeOff, 'requests'),
    title: 'List time off',
    titleKa: 'შვებულებების სია',
    description:
      "List time-off requests across all staff, optionally by status: who, status, start and end dates and reason. Use list_staff_time_off for one person's requests.",
    method: 'get',
    path: '/staff/time-off',
    query: listTimeOffQuerySchema,
  },
  {
    name: 'list_staff_time_off',
    project: listOf(slimTimeOff, 'requests'),
    title: 'List staff time off',
    titleKa: 'თანამშრომლის შვებულებები',
    description:
      "List one staff member's time-off requests with status, dates and reason. Use list_time_off for the whole team.",
    method: 'get',
    path: '/staff/:staffId/time-off',
    params: staffId,
  },
  {
    name: 'create_staff_time_off',
    title: 'Create staff time off',
    titleKa: 'შვებულების დამატება',
    description:
      'File a time-off request for a staff member with start and end dates and a reason, and return it. Approve or reject it with decide_staff_time_off.',
    method: 'post',
    path: '/staff/:staffId/time-off',
    destructive: false,
    body: createTimeOffRequestSchema,
    params: staffId,
  },
  {
    name: 'decide_staff_time_off',
    title: 'Decide staff time off',
    titleKa: 'შვებულებაზე გადაწყვეტილება',
    description:
      'Approve or reject a pending staff time-off request and return the decided request. Request ids come from list_time_off.',
    method: 'patch',
    path: '/staff/time-off/:requestId/decision',
    destructive: false,
    body: decideTimeOffRequestSchema,
    params: { requestId: z.string().min(1) },
  },
  {
    name: 'delete_staff_time_off',
    title: 'Delete staff time off',
    titleKa: 'შვებულების წაშლა',
    description:
      'Permanently delete a staff time-off request. Use decide_staff_time_off to reject it while keeping a record.',
    method: 'del',
    path: '/staff/time-off/:requestId',
    destructive: true,
    params: { requestId: z.string().min(1) },
  },
  {
    name: 'get_staff_schedule',
    title: 'Get staff schedule',
    titleKa: 'პერსონალის ცვლები',
    description:
      "Read one staff member's weekly shift schedule: day, start and end time and branch per shift. Use before update_staff_schedule.",
    method: 'get',
    path: '/staff/:staffId/schedule',
    params: staffId,
  },
  {
    name: 'update_staff_schedule',
    title: 'Update staff schedule',
    titleKa: 'პერსონალის ცვლების შეცვლა',
    description:
      "Replace one staff member's weekly shift schedule with the shifts sent and return the stored schedule. Read get_staff_schedule first to keep unchanged shifts.",
    method: 'put',
    path: '/staff/:staffId/schedule',
    destructive: false,
    body: updateStaffScheduleSchema,
    params: staffId,
  },
  {
    name: 'get_staff_working_now',
    title: 'Get staff working now',
    titleKa: 'ახლა მომუშავე პერსონალი',
    description:
      "List the staff on shift at this moment, optionally for one branch, with role and shift times. Use for 'who is working now' questions.",
    method: 'get',
    path: '/staff/working-now',
    query: workingNowQuerySchema,
  },
]);
