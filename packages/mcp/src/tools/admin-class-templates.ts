import { z } from 'zod';
import {
  createClassTemplateSchema,
  listAdminClassTemplatesQuerySchema,
  updateClassTemplateSchema,
} from '@fit/types';
import { listOf, slimClass } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/classes/admin-class-templates.controller.ts. */
export const adminClassTemplatesTools = defineTools('classes', [
  {
    name: 'list_classes',
    project: listOf(slimClass),
    title: 'List class templates',
    titleKa: 'კლასების სია',
    description:
      'List recurring class templates page by page: id, title, status, category, start time, recurrence and trainer. Use list_schedule for dated occurrences and get_class for full detail.',
    method: 'get',
    path: '/admin/classes',
    query: listAdminClassTemplatesQuerySchema,
  },
  {
    name: 'get_class',
    title: 'Get class template',
    titleKa: 'კლასის დეტალები',
    description:
      'Read one recurring class template in full: recurrence rule, capacity, duration, pricing, trainer, branch and validity window. Use before update_class or set_class_status.',
    method: 'get',
    path: '/admin/classes/:id',
    params: id,
  },
  {
    name: 'create_class',
    title: 'Create class template',
    titleKa: 'კლასის შექმნა',
    description:
      'Create a recurring class from a title, recurrence rule, capacity, duration and start date; it starts generating occurrences unless created paused. Use schedule_class_instance for a one-off class.',
    method: 'post',
    path: '/admin/classes',
    destructive: false,
    body: createClassTemplateSchema,
  },
  {
    name: 'update_class',
    title: 'Update class template',
    titleKa: 'კლასის რედაქტირება',
    description:
      "Edit a recurring class template's profile, timing, capacity or pricing and return the updated template. Read get_class first; pricing changes affect what members pay.",
    method: 'patch',
    path: '/admin/classes/:id',
    destructive: true,
    body: updateClassTemplateSchema,
    params: id,
  },
  {
    name: 'set_class_status',
    title: 'Resume / pause class',
    titleKa: 'კლასის შეჩერება ან განახლება',
    description:
      'Pause a recurring class (active=false) so it stops generating occurrences, or resume it (active=true). Returns the updated template; use cancel_class_instance for a single date.',
    method: 'post',
    path: '/admin/classes/:id/pause',
    activePath: '/admin/classes/:id/resume',
    destructive: true,
    params: id,
  },
  {
    name: 'delete_class',
    title: 'Delete class',
    titleKa: 'კლასის წაშლა',
    description:
      'Permanently delete a recurring class template. Prefer set_class_status to pause it when the class may return.',
    method: 'del',
    path: '/admin/classes/:id',
    destructive: true,
    params: id,
  },
]);
