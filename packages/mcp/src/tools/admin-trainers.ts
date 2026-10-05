import { z } from 'zod';
import {
  createTrainerSchema,
  listAdminTrainersQuerySchema,
  setTrainerAvailabilitySchema,
  updateTrainerSchema,
} from '@fit/types';
import { listOf, slimTrainer } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/trainers/admin-trainers.controller.ts. */
export const adminTrainersTools = defineTools('trainers', [
  {
    name: 'list_trainers',
    core: true,
    project: listOf(slimTrainer),
    title: 'List trainers',
    titleKa: 'ტრენერების სია',
    description:
      'List trainer profiles page by page: id, name, status, headline, rating and classes this week. Use get_trainer for bio, specialties and next class; staff accounts are in list_staff.',
    method: 'get',
    path: '/admin/trainers',
    query: listAdminTrainersQuerySchema,
  },
  {
    name: 'get_trainer',
    title: 'Get trainer',
    titleKa: 'ტრენერის დეტალები',
    description:
      'Read one trainer profile in full: headline, bio, specialties, rating, reviews count and upcoming classes. Use before update_trainer.',
    method: 'get',
    path: '/admin/trainers/:id',
    params: id,
  },
  {
    name: 'list_trainer_clients',
    title: 'List trainer clients',
    titleKa: 'ტრენერის კლიენტები',
    description:
      "List a trainer's personal-training clients, built from their booked sessions. Use for 'who does this coach train' questions.",
    method: 'get',
    path: '/admin/trainers/:id/clients',
    params: id,
  },
  {
    name: 'create_trainer',
    title: 'Create trainer',
    titleKa: 'ტრენერის დამატება',
    description:
      'Create a public trainer profile from a name with optional headline, bio, photo and specialties. Returns the new profile; set hours with set_trainer_availability.',
    method: 'post',
    path: '/admin/trainers',
    destructive: false,
    body: createTrainerSchema,
  },
  {
    name: 'update_trainer',
    title: 'Update trainer',
    titleKa: 'ტრენერის რედაქტირება',
    description:
      "Edit a trainer profile's name, headline, bio, photo or specialties and return the updated profile. Read get_trainer first to keep unchanged values.",
    method: 'patch',
    path: '/admin/trainers/:id',
    destructive: false,
    body: updateTrainerSchema,
    params: id,
  },
  {
    name: 'get_trainer_availability',
    title: 'Get trainer availability',
    titleKa: 'ტრენერის ხელმისაწვდომობა',
    description:
      "Read a trainer's weekly recurring availability as a seven-day map of time windows; unset days read as unavailable. Use before set_trainer_availability.",
    method: 'get',
    path: '/admin/trainers/:id/availability',
    params: id,
  },
  {
    name: 'set_trainer_availability',
    title: 'Set trainer availability',
    titleKa: 'ტრენერის ხელმისაწვდომობის შეცვლა',
    description:
      "Replace a trainer's whole weekly availability with HH:MM windows per day (no overlaps) and return what was stored. Read get_trainer_availability first to keep other days.",
    method: 'put',
    path: '/admin/trainers/:id/availability',
    destructive: false,
    body: setTrainerAvailabilitySchema,
    params: id,
  },
  {
    name: 'set_trainer_status',
    title: 'Activate / deactivate trainer',
    titleKa: 'ტრენერის ჩართვა ან გამორთვა',
    description:
      'Hide a trainer profile (active=false) or show it again (active=true) and return the updated profile. Confirm the trainer with get_trainer first.',
    method: 'post',
    path: '/admin/trainers/:id/deactivate',
    activePath: '/admin/trainers/:id/reactivate',
    destructive: true,
    params: id,
  },
]);
