import { z } from 'zod';
import {
  createLocationSchema,
  listAdminLocationsQuerySchema,
  updateLocationSchema,
} from '@fit/types';
import { listOf, slimLocation } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/locations/admin-locations.controller.ts. */
export const adminLocationsTools = defineTools('locations', [
  {
    name: 'list_locations',
    core: true,
    project: listOf(slimLocation),
    title: 'List locations',
    titleKa: 'ფილიალების სია',
    description:
      "List the gym's branches page by page: id, name, status, address and which is the default. Use these ids as locationId filters in other tools; get_location has hours and amenities.",
    method: 'get',
    path: '/admin/locations',
    query: listAdminLocationsQuerySchema,
  },
  {
    name: 'get_location',
    title: 'Get location',
    titleKa: 'ფილიალის დეტალები',
    description:
      'Read one branch in full: address, phone, photo, amenities, opening hours, status and default flag. Use before update_location.',
    method: 'get',
    path: '/admin/locations/:id',
    params: id,
  },
  {
    name: 'create_location',
    title: 'Create location',
    titleKa: 'ფილიალის შექმნა',
    description:
      'Create a branch from a name with optional address, phone, photo, amenities and opening hours. Returns the new branch.',
    method: 'post',
    path: '/admin/locations',
    destructive: false,
    body: createLocationSchema,
  },
  {
    name: 'update_location',
    title: 'Update location',
    titleKa: 'ფილიალის რედაქტირება',
    description:
      "Edit a branch's name, address, phone, photo, amenities or opening hours and return the updated branch. Read get_location first to keep unchanged values.",
    method: 'patch',
    path: '/admin/locations/:id',
    destructive: false,
    body: updateLocationSchema,
    params: id,
  },
  {
    name: 'set_location_status',
    title: 'Activate / deactivate location',
    titleKa: 'ფილიალის ჩართვა ან გამორთვა',
    description:
      'Close a branch (active=false) or reopen it (active=true) and return the updated branch. Confirm the branch with get_location first.',
    method: 'post',
    path: '/admin/locations/:id/deactivate',
    activePath: '/admin/locations/:id/reactivate',
    destructive: true,
    params: id,
  },
  {
    name: 'make_default_location',
    title: 'Make default location',
    titleKa: 'ძირითადი ფილიალის არჩევა',
    description:
      "Make an active branch the gym's default, used when a check-in names no branch. Returns the updated branch.",
    method: 'post',
    path: '/admin/locations/:id/make-default',
    destructive: false,
    params: id,
  },
]);
