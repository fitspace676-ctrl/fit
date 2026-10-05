import { z } from 'zod';
import {
  createServiceCategorySchema,
  createServiceSchema,
  listAdminServicesQuerySchema,
  updateServiceSchema,
} from '@fit/types';
import { listOf, slimService } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/services/admin-services.controller.ts. */
export const adminServicesTools = defineTools('services', [
  {
    name: 'list_services',
    project: listOf(slimService),
    title: 'List services',
    titleKa: 'სერვისების სია',
    description:
      'List bookable catalogue services (personal training, massage and other custom services) page by page: id, name, status, type, price, duration and staff. Use get_service for full detail.',
    method: 'get',
    path: '/admin/services',
    query: listAdminServicesQuerySchema,
  },
  {
    name: 'list_service_staff',
    title: 'List service staff',
    titleKa: 'სერვისის პერსონალი',
    description:
      'List staff who can deliver services, with id, name and whether they are trainers. Use to pick staffId for create_service.',
    method: 'get',
    path: '/admin/services/staff',
  },
  {
    name: 'list_service_categories',
    title: 'List service categories',
    titleKa: 'სერვისის კატეგორიები',
    description:
      "List the gym's service categories with how many services each contains. Use to pick a category id for create_service or update_service.",
    method: 'get',
    path: '/admin/services/categories',
  },
  {
    name: 'create_service_category',
    title: 'Create service category',
    titleKa: 'სერვისის კატეგორიის შექმნა',
    description:
      'Create a service category with a unique name and return it. Use list_service_categories first to avoid duplicates.',
    method: 'post',
    path: '/admin/services/categories',
    destructive: false,
    body: createServiceCategorySchema,
  },
  {
    name: 'delete_service_category',
    title: 'Delete service category',
    titleKa: 'სერვისის კატეგორიის წაშლა',
    description:
      'Delete a service category that no service uses. Move or archive its services first if it is still in use.',
    method: 'del',
    path: '/admin/services/categories/:id',
    destructive: true,
    params: id,
  },
  {
    name: 'get_service',
    title: 'Get service',
    titleKa: 'სერვისის დეტალები',
    description:
      'Read one catalogue service in full: type, name, staff, price, duration, description, category and status. Use before update_service or archive_service.',
    method: 'get',
    path: '/admin/services/:id',
    params: id,
  },
  {
    name: 'create_service',
    title: 'Create service',
    titleKa: 'სერვისის შექმნა',
    description:
      'Create a PERSONAL_TRAINING or CUSTOM catalogue service in the data object; CUSTOM needs a name, PT names come from the staff member. Returns the new service; open slots with create_service_session.',
    method: 'post',
    path: '/admin/services',
    destructive: false,
    body: createServiceSchema,
  },
  {
    name: 'update_service',
    title: 'Update service',
    titleKa: 'სერვისის რედაქტირება',
    description:
      "Edit a catalogue service's name, staff, price, duration, description or category and return the updated service. Read get_service first; price changes affect new bookings.",
    method: 'patch',
    path: '/admin/services/:id',
    destructive: true,
    body: updateServiceSchema,
    params: id,
  },
  {
    name: 'archive_service',
    title: 'Archive service',
    titleKa: 'სერვისის დაარქივება',
    description:
      'Archive a catalogue service so it can no longer be booked; history stays. Returns the updated service; restore_service reverses it.',
    method: 'post',
    path: '/admin/services/:id/archive',
    destructive: true,
    params: id,
  },
  {
    name: 'restore_service',
    title: 'Restore service',
    titleKa: 'სერვისის აღდგენა',
    description:
      'Return an archived catalogue service to the bookable catalogue and return the updated service. Use to reverse archive_service.',
    method: 'post',
    path: '/admin/services/:id/restore',
    destructive: false,
    params: id,
  },
  {
    name: 'delete_service',
    title: 'Delete service',
    titleKa: 'სერვისის წაშლა',
    description:
      'Permanently delete an archived catalogue service that was never booked. Archive it first with archive_service; booked services can only stay archived.',
    method: 'del',
    path: '/admin/services/:id',
    destructive: true,
    params: id,
  },
]);
