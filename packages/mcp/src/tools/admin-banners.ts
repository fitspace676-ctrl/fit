import { z } from 'zod';
import { createBannerSchema, reorderBannersSchema, updateBannerSchema } from '@fit/types';
import { listOf, slimBanner } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/banners/admin-banners.controller.ts. */
export const adminBannersTools = defineTools('marketing', [
  {
    name: 'list_banners',
    project: listOf(slimBanner, 'banners'),
    title: 'List banners',
    titleKa: 'ბანერების სია',
    description:
      'List every promotional banner in carousel order, including drafts and expired ones: id, title, active flag, position and display window. Use get_banner for image and link.',
    method: 'get',
    path: '/marketing/banners',
  },
  {
    name: 'reorder_banners',
    title: 'Reorder banners',
    titleKa: 'ბანერების გადალაგება',
    description:
      'Set the carousel order of banners: each id takes the position of its index in ids. Use list_banners first to get every id.',
    method: 'patch',
    path: '/marketing/banners/reorder',
    destructive: false,
    body: reorderBannersSchema,
  },
  {
    name: 'get_banner',
    title: 'Get banner',
    titleKa: 'ბანერის დეტალები',
    description:
      'Read one banner in full: title, image, link, position, active flag and display window. Use before update_banner.',
    method: 'get',
    path: '/marketing/banners/:id',
    params: id,
  },
  {
    name: 'create_banner',
    title: 'Create banner',
    titleKa: 'ბანერის შექმნა',
    description:
      'Create a promotional banner with a title, link, active flag and optional display window, and return it. The artwork is uploaded separately in the admin app.',
    method: 'post',
    path: '/marketing/banners',
    destructive: false,
    body: createBannerSchema,
  },
  {
    name: 'update_banner',
    title: 'Update banner',
    titleKa: 'ბანერის რედაქტირება',
    description:
      "Edit a banner's title, link, active flag or display window; only the fields sent change. Returns the updated banner.",
    method: 'patch',
    path: '/marketing/banners/:id',
    destructive: false,
    body: updateBannerSchema,
    params: id,
  },
  {
    name: 'delete_banner',
    title: 'Delete banner',
    titleKa: 'ბანერის წაშლა',
    description:
      'Permanently delete a banner and its image. Use update_banner to switch it off instead if it may return.',
    method: 'del',
    path: '/marketing/banners/:id',
    destructive: true,
    params: id,
  },
]);
