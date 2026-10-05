import { z } from 'zod';
import {
  createClassTypeSchema,
  listAdminClassTypesQuerySchema,
  updateClassTypeSchema,
} from '@fit/types';
import { listOf, slimClassType } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/classes/class-types.controller.ts. */
export const classTypesTools = defineTools('classes', [
  {
    name: 'list_class_types',
    project: listOf(slimClassType),
    title: 'List class types',
    titleKa: 'კლასის ტიპები',
    description:
      'List class types (reusable class definitions) page by page: id, name, status, duration, capacity and pricing. Use get_class_type for full detail and list_schedule for dated classes.',
    method: 'get',
    path: '/admin/class-types',
    query: listAdminClassTypesQuerySchema,
  },
  {
    name: 'list_class_type_options',
    title: 'List class type options',
    titleKa: 'კლასის ტიპების არჩევანი',
    description:
      'List active class types as short id and name options. Use to pick a classTypeId for schedule_class_instance or create_pt_session.',
    method: 'get',
    path: '/admin/class-types/options',
  },
  {
    name: 'get_class_type',
    title: 'Get class type',
    titleKa: 'კლასის ტიპის დეტალები',
    description:
      'Read one class type in full: name, duration, capacity, colour, pricing rule, price, included plans and branch. Use before update_class_type.',
    method: 'get',
    path: '/admin/class-types/:id',
    params: id,
  },
  {
    name: 'create_class_type',
    title: 'Create class type',
    titleKa: 'კლასის ტიპის შექმნა',
    description:
      'Create a class type from a name, capacity and duration with optional pricing and branch. Returns the new type; schedule occurrences with schedule_class_instance.',
    method: 'post',
    path: '/admin/class-types',
    destructive: false,
    body: createClassTypeSchema,
  },
  {
    name: 'update_class_type',
    title: 'Update class type',
    titleKa: 'კლასის ტიპის რედაქტირება',
    description:
      'Edit any class type fields, including pricing and branch, and return the updated type. Read get_class_type first; price changes affect future bookings.',
    method: 'patch',
    path: '/admin/class-types/:id',
    destructive: true,
    body: updateClassTypeSchema,
    params: id,
  },
  {
    name: 'deactivate_class_type',
    title: 'Deactivate class type',
    titleKa: 'კლასის ტიპის გამორთვა',
    description:
      'Retire a class type so it can no longer be scheduled; existing classes stay. Returns the updated type; activate_class_type reverses it.',
    method: 'post',
    path: '/admin/class-types/:id/deactivate',
    destructive: true,
    params: id,
  },
  {
    name: 'activate_class_type',
    title: 'Activate class type',
    titleKa: 'კლასის ტიპის ჩართვა',
    description:
      'Make a retired class type schedulable again and return the updated type. Use to reverse deactivate_class_type.',
    method: 'post',
    path: '/admin/class-types/:id/activate',
    destructive: false,
    params: id,
  },
]);
