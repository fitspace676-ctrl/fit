import { z } from 'zod';
import { listAdminTrainerReviewsQuerySchema } from '@fit/types';
import { listOf, slimReview } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/reviews/admin-reviews.controller.ts. */
export const adminReviewsTools = defineTools('insights', [
  {
    name: 'list_trainer_reviews',
    project: listOf(slimReview),
    title: 'List trainer reviews',
    titleKa: 'ტრენერების შეფასებები',
    description:
      "List a trainer's member reviews page by page, visible and hidden unless status is set: author, rating, comment, class and date. trainer id comes from list_trainers.",
    method: 'get',
    path: '/admin/trainers/:id/reviews',
    query: listAdminTrainerReviewsQuerySchema,
    params: id,
  },
  {
    name: 'hide_trainer_review',
    title: 'Hide trainer review',
    titleKa: 'შეფასების დამალვა',
    description:
      "Hide an abusive review from the public listing and the trainer's rating without deleting it. Returns the review's new state; unhide_trainer_review reverses it.",
    method: 'post',
    path: '/admin/reviews/:id/hide',
    destructive: false,
    params: id,
  },
  {
    name: 'unhide_trainer_review',
    title: 'Unhide trainer review',
    titleKa: 'შეფასების გამოჩენა',
    description:
      "Make a hidden review visible again and count it toward the trainer's rating. Returns the review's new state.",
    method: 'post',
    path: '/admin/reviews/:id/unhide',
    destructive: false,
    params: id,
  },
]);
