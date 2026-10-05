import { z } from 'zod';
import {
  createStaffSchema,
  inviteStaffSchema,
  listStaffQuerySchema,
  updateStaffProfileSchema,
  updateStaffRoleSchema,
} from '@fit/types';
import { slimFields, slimInvite, slimStaff } from './projections';
import { defineTools } from './shared';

const memberId = { memberId: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/staff/staff.controller.ts. */
export const staffTools = defineTools('staff', [
  {
    name: 'list_staff',
    core: true,
    project: (value) => slimFields(value, { staff: slimStaff, invites: slimInvite }),
    title: 'List staff',
    titleKa: 'პერსონალის სია',
    description:
      'List gym staff (id, name, status, role, email) and pending invitations, optionally filtered by role or status. Use for employee accounts; gym members are in list_members, trainer profiles in list_trainers.',
    method: 'get',
    path: '/staff',
    query: listStaffQuerySchema,
  },
  {
    name: 'create_staff',
    title: 'Create staff',
    titleKa: 'თანამშრომლის დამატება',
    description:
      'Add a staff record without a login from a first name and role, with optional contact, branches and weekly schedule. Returns the staff member; use invite_staff to give someone a login.',
    method: 'post',
    path: '/staff',
    destructive: false,
    body: createStaffSchema,
  },
  {
    name: 'invite_staff',
    title: 'Invite staff',
    titleKa: 'თანამშრომლის მოწვევა',
    description:
      'Invite a person by email to join the gym staff with a role and return the invitation id. Fails if the address is already staff; revoke_staff_invite cancels it.',
    method: 'post',
    path: '/staff/invite',
    destructive: false,
    body: inviteStaffSchema,
  },
  {
    name: 'revoke_staff_invite',
    title: 'Revoke staff invite',
    titleKa: 'მოწვევის გაუქმება',
    description:
      'Cancel a pending staff invitation so its link no longer works. Invitation ids come from list_staff.',
    method: 'del',
    path: '/staff/invite/:inviteId',
    destructive: true,
    params: { inviteId: z.string().min(1) },
  },
  {
    name: 'update_staff_role',
    title: 'Update staff role',
    titleKa: 'თანამშრომლის როლის შეცვლა',
    description:
      "Change a staff member's role and permissions and return the updated record. The gym's only owner cannot be downgraded; other profile fields use update_staff_profile.",
    method: 'patch',
    path: '/staff/:memberId/role',
    destructive: false,
    body: updateStaffRoleSchema,
    params: memberId,
  },
  {
    name: 'update_staff_profile',
    title: 'Update staff profile',
    titleKa: 'თანამშრომლის პროფილის რედაქტირება',
    description:
      "Edit a staff member's name, status, contact details, branches or weekly schedule and return the updated record. Setting an inactive status takes them off duty; roles use update_staff_role.",
    method: 'patch',
    path: '/staff/:memberId/profile',
    destructive: true,
    body: updateStaffProfileSchema,
    params: memberId,
  },
  {
    name: 'remove_staff',
    title: 'Remove staff',
    titleKa: 'თანამშრომლის წაშლა',
    description:
      "Remove a person from the gym staff and sign them out immediately. The gym's only owner cannot be removed; confirm the person with list_staff first.",
    method: 'del',
    path: '/staff/:memberId',
    destructive: true,
    params: memberId,
  },
]);
