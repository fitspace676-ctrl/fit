import { z } from 'zod';
import {
  adminBookMemberSchema,
  adminScheduleQuerySchema,
  scheduleClassInstanceSchema,
} from '@fit/types';
import { listOf, slimScheduleInstance } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/classes/admin-schedule.controller.ts. */
export const adminScheduleTools = defineTools('classes', [
  {
    name: 'list_schedule',
    core: true,
    project: listOf(slimScheduleInstance, 'instances'),
    title: 'List schedule',
    titleKa: 'განრიგი',
    description:
      'List dated class occurrences in a from/to window: id, title, status, start, trainer, booked count and capacity. Use get_schedule_instance for the roster and list_classes for recurring templates.',
    method: 'get',
    path: '/admin/schedule',
    query: adminScheduleQuerySchema,
  },
  {
    name: 'schedule_class_instance',
    title: 'Schedule class instance',
    titleKa: 'გაკვეთილის დაგეგმვა',
    description:
      'Schedule one dated class from an active class type; the end time follows its duration. Returns the occurrence with an empty roster; use create_class for a recurring class.',
    method: 'post',
    path: '/admin/schedule/instances',
    destructive: false,
    body: scheduleClassInstanceSchema,
  },
  {
    name: 'get_schedule_instance',
    title: 'Get schedule instance',
    titleKa: 'გაკვეთილის დეტალები',
    description:
      'Read one dated class with its booking roster, held seats, waitlist and occupancy. Use for who is booked, and before cancel_class_instance or promote_class_waitlist.',
    method: 'get',
    path: '/admin/schedule/instances/:id',
    params: id,
  },
  {
    name: 'cancel_class_instance',
    title: 'Cancel class instance',
    titleKa: 'გაკვეთილის გაუქმება',
    description:
      'Cancel one dated class, releasing every booking and refunding held class credits. Returns the updated occurrence; check get_schedule_instance first.',
    method: 'post',
    path: '/admin/schedule/instances/:id/cancel',
    destructive: true,
    params: id,
  },
  {
    name: 'promote_class_waitlist',
    title: 'Promote class waitlist',
    titleKa: 'მოლოდინის სიიდან გადაყვანა',
    description:
      'Move a waitlisted booking into a held seat, even over capacity, charging a class credit if needed. Returns the updated occurrence; bookingId comes from get_schedule_instance.',
    method: 'post',
    path: '/admin/schedule/instances/:id/bookings/:bookingId/promote',
    destructive: false,
    params: { ...id, bookingId: z.string().min(1) },
  },
  {
    name: 'book_member_onto_class',
    title: 'Book member onto class',
    titleKa: 'წევრის ჩაწერა გაკვეთილზე',
    description:
      'Book a member onto a dated class, charging a credit when required or waitlisting them when full. Returns the updated occurrence; memberId from list_members, id from list_schedule.',
    method: 'post',
    path: '/admin/schedule/instances/:id/bookings',
    destructive: false,
    body: adminBookMemberSchema,
    params: id,
  },
]);
