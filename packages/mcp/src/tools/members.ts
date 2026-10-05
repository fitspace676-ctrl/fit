import { z } from 'zod';
import {
  bulkExportMembersSchema,
  createMemberNoteSchema,
  createMemberSchema,
  createMemberTaskSchema,
  listMembersQuerySchema,
  sendMemberEmailSchema,
  setMemberKindSchema,
  updateMemberSchema,
  updateMemberTaskSchema,
} from '@fit/types';
import { listOf, slimMember } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/members/members.controller.ts. */
export const membersTools = defineTools('members', [
  {
    name: 'list_members',
    core: true,
    project: listOf(slimMember),
    title: 'List members',
    titleKa: 'წევრების სია',
    description:
      'Search and filter gym members page by page; rows carry id, name, status, email, phone, plan and last visit with total/page/limit. Use get_member for the full profile; staff accounts are in list_staff.',
    method: 'get',
    path: '/members',
    query: listMembersQuerySchema,
  },
  {
    name: 'get_member',
    core: true,
    title: 'Get member',
    titleKa: 'წევრის დეტალები',
    description:
      "Read one member's full profile: contact, status, plan and billing, notes, tasks and visit history. Use after list_members to answer detailed questions or before editing the member.",
    method: 'get',
    path: '/members/:id',
    params: id,
  },
  {
    name: 'bulk_export_members',
    title: 'Bulk export members',
    titleKa: 'წევრების ექსპორტი',
    description:
      'Start a background CSV export of selected members or the current filter and return its job id. Use only when the operator wants a file; answer questions with list_members instead.',
    method: 'post',
    path: '/members/bulk-export',
    destructive: false,
    body: bulkExportMembersSchema,
  },
  {
    name: 'create_member',
    title: 'Create member',
    titleKa: 'წევრის დამატება',
    description:
      'Add a member by name and email (phone and status optional); an existing person with that email is linked to this gym. Returns the new member profile; search list_members first to avoid duplicates.',
    method: 'post',
    path: '/members',
    destructive: false,
    body: createMemberSchema,
  },
  {
    name: 'update_member_contact',
    title: 'Update member profile',
    titleKa: 'წევრის პროფილის რედაქტირება',
    description:
      "Update a member's name, phone and home branch; null clears the phone. Returns the updated profile. Read get_member first to keep values the operator did not ask to change.",
    method: 'patch',
    path: '/members/:id',
    destructive: false,
    body: updateMemberSchema,
    params: id,
  },
  {
    name: 'set_member_status',
    title: 'Activate / suspend member',
    titleKa: 'წევრის შეჩერება ან გააქტიურება',
    description:
      'Suspend a member (active=false) or reactivate them (active=true) and return the updated profile. Confirm the member with get_member first; use trash_member to remove them from the roster.',
    method: 'post',
    path: '/members/:id/deactivate',
    activePath: '/members/:id/reactivate',
    destructive: true,
    params: id,
  },
  {
    name: 'set_member_kind',
    title: 'Set member kind',
    titleKa: 'წევრის ტიპის შეცვლა',
    description:
      "Pin a person's standing as member, guest or lapsed, or send kind null to let it follow their subscriptions again. Returns the member's new status; use set_member_status to suspend instead.",
    method: 'patch',
    path: '/members/:id/kind',
    destructive: true,
    body: setMemberKindSchema,
    params: id,
  },
  {
    name: 'trash_member',
    title: 'Trash member',
    titleKa: 'წევრის წაშლა',
    description:
      'Move a member to trash: they leave the roster and counts but can be brought back with restore_member for 30 days before permanent deletion. Returns the trashed member.',
    method: 'post',
    path: '/members/:id/trash',
    destructive: true,
    params: id,
  },
  {
    name: 'restore_member',
    title: 'Restore member',
    titleKa: 'წევრის აღდგენა',
    description:
      'Bring a trashed member back to the live roster with their previous status and return the restored profile. Use only for members removed with trash_member.',
    method: 'post',
    path: '/members/:id/restore',
    destructive: false,
    params: id,
  },
  {
    name: 'add_member_note',
    title: 'Add member note',
    titleKa: 'შენიშვნის დამატება წევრზე',
    description:
      "Attach a staff note to a member's profile, authored by the signed-in operator, and return the refreshed profile. Use add_member_task for follow-ups that need to be done.",
    method: 'post',
    path: '/members/:id/notes',
    destructive: false,
    body: createMemberNoteSchema,
    params: id,
  },
  {
    name: 'send_member_email',
    title: 'Send member email',
    titleKa: 'წევრისთვის წერილის გაგზავნა',
    description:
      'Email one member a one-off message with a subject and body; returns whether it was sent. Use marketing campaigns to message many members at once.',
    method: 'post',
    path: '/members/:id/email',
    destructive: true,
    body: sendMemberEmailSchema,
    params: id,
  },
  {
    name: 'add_member_task',
    title: 'Add member task',
    titleKa: 'დავალების დამატება წევრზე',
    description:
      'Create a follow-up task on a member (for example a call-back) and return the refreshed profile. Use update_member_task to mark it done.',
    method: 'post',
    path: '/members/:id/tasks',
    destructive: false,
    body: createMemberTaskSchema,
    params: id,
  },
  {
    name: 'update_member_task',
    title: 'Update member task',
    titleKa: 'წევრის დავალების განახლება',
    description:
      "Mark a member's follow-up task done or pending again and return the refreshed profile. Task ids come from get_member.",
    method: 'patch',
    path: '/members/:id/tasks/:taskId',
    destructive: false,
    body: updateMemberTaskSchema,
    params: { ...id, taskId: z.string().min(1) },
  },
]);
