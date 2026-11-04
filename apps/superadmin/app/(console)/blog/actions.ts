'use server';

import { revalidatePath } from 'next/cache';
import {
  BLOG_SLUG_TAKEN_CODE,
  createBlogAuthorSchema,
  createBlogCategorySchema,
  createBlogPostSchema,
  publishBlogPostSchema,
  updateBlogAuthorSchema,
  updateBlogCategorySchema,
  updateBlogPostSchema,
  type AdminBlogPost,
  type BlogAuthor,
  type BlogCategory,
  type CreateBlogAuthorBody,
  type CreateBlogCategoryBody,
  type CreateBlogPostInput,
  type UpdateBlogAuthorBody,
  type UpdateBlogCategoryBody,
  type UpdateBlogPostInput,
} from '@fit/types';
import {
  ApiError,
  createBlogAuthor,
  createBlogCategory,
  createBlogPost,
  deleteBlogAuthor,
  deleteBlogCategory,
  deleteBlogPost,
  publishBlogPost,
  unpublishBlogPost,
  updateBlogAuthor,
  updateBlogCategory,
  updateBlogPost,
} from '@/lib/api';
import { requireOperator } from '@/lib/operator';
import type { ActionResult } from '../actions';

/** API error codes worth saying in words; anything else is shown as the API sent it. */
const MESSAGES: Record<string, string> = {
  [BLOG_SLUG_TAKEN_CODE]: 'Slug already in use',
  MEDIA_NOT_OWNED: 'An image is not a blog upload — upload it again from this console.',
  BLOG_POST_NOT_FOUND: 'This post no longer exists.',
  BLOG_CATEGORY_NOT_FOUND: 'That category no longer exists.',
  BLOG_AUTHOR_NOT_FOUND: 'That author no longer exists.',
};

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.message] ?? `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/** Validate here with the API's own schema, so a bad field is answered without a round trip. */
interface Schema<T> {
  safeParse(
    input: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

function validate<T>(
  schema: Schema<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; error: string } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  return {
    ok: false,
    error: first
      ? `${first.path.map(String).join('.') || 'input'}: ${first.message}`
      : 'Invalid details',
  };
}

/** Run one authorised API call, refreshing the screens that show what it changed. */
async function run<T>(call: () => Promise<T>, paths: string[]): Promise<ActionResult<T>> {
  if (!(await requireOperator())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const data = await call();
    for (const path of paths) revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

const postPaths = (id: string) => ['/blog', `/blog/${id}`, `/blog/${id}/preview`];

// --- Posts ------------------------------------------------------------------

export async function createBlogPostAction(
  input: CreateBlogPostInput,
): Promise<ActionResult<AdminBlogPost>> {
  const body = validate(createBlogPostSchema, input);
  if (!body.ok) return body;
  return run(() => createBlogPost(body.data), ['/blog']);
}

export async function updateBlogPostAction(
  id: string,
  input: UpdateBlogPostInput,
): Promise<ActionResult<AdminBlogPost>> {
  const body = validate(updateBlogPostSchema, input);
  if (!body.ok) return body;
  return run(() => updateBlogPost(id, body.data), postPaths(id));
}

export async function deleteBlogPostAction(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await deleteBlogPost(id);
    return null;
  }, ['/blog']);
}

/** Publish now (no `publishAt`), or schedule for a future ISO instant. */
export async function publishBlogPostAction(
  id: string,
  publishAt?: string,
): Promise<ActionResult<AdminBlogPost>> {
  const body = validate(publishBlogPostSchema, publishAt ? { publishAt } : {});
  if (!body.ok) return body;
  return run(() => publishBlogPost(id, body.data.publishAt), postPaths(id));
}

export async function unpublishBlogPostAction(id: string): Promise<ActionResult<AdminBlogPost>> {
  return run(() => unpublishBlogPost(id), postPaths(id));
}

// --- Categories and authors -------------------------------------------------
//
// Both are read by the post list and form too, so a change refreshes the lot.

const taxonomyPaths = (page: string) => [page, '/blog', '/blog/new'];

export async function createBlogCategoryAction(
  input: CreateBlogCategoryBody,
): Promise<ActionResult<BlogCategory>> {
  const body = validate(createBlogCategorySchema, input);
  if (!body.ok) return body;
  return run(() => createBlogCategory(body.data), taxonomyPaths('/blog/categories'));
}

export async function updateBlogCategoryAction(
  id: string,
  input: UpdateBlogCategoryBody,
): Promise<ActionResult<BlogCategory>> {
  const body = validate(updateBlogCategorySchema, input);
  if (!body.ok) return body;
  return run(() => updateBlogCategory(id, body.data), taxonomyPaths('/blog/categories'));
}

export async function deleteBlogCategoryAction(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await deleteBlogCategory(id);
    return null;
  }, taxonomyPaths('/blog/categories'));
}

export async function createBlogAuthorAction(
  input: CreateBlogAuthorBody,
): Promise<ActionResult<BlogAuthor>> {
  const body = validate(createBlogAuthorSchema, input);
  if (!body.ok) return body;
  return run(() => createBlogAuthor(body.data), taxonomyPaths('/blog/authors'));
}

export async function updateBlogAuthorAction(
  id: string,
  input: UpdateBlogAuthorBody,
): Promise<ActionResult<BlogAuthor>> {
  const body = validate(updateBlogAuthorSchema, input);
  if (!body.ok) return body;
  return run(() => updateBlogAuthor(id, body.data), taxonomyPaths('/blog/authors'));
}

export async function deleteBlogAuthorAction(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await deleteBlogAuthor(id);
    return null;
  }, taxonomyPaths('/blog/authors'));
}
