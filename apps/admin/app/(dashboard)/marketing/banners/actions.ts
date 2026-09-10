'use server';

// @fit/admin — Server Actions behind the home-screen banner manager (T1.16).
//
// Same shape as the Marketing workspace's own `../actions.ts`: every action
// re-asserts the capability (a Server Action is a POST endpoint in its own right,
// so the route gate in the dashboard layout is not the last word), re-validates
// the body with the SAME Zod schema the API parses it with, and returns a
// discriminated `ActionResult` rather than throwing across the boundary.
//
// A separate file from the workspace's actions because it is a separate route
// (`/marketing/banners`) with its own `revalidatePath`; sharing one would refresh
// the wrong screen after every write.

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createBannerSchema,
  reorderBannersSchema,
  roleHasPermission,
  updateBannerSchema,
  uploadBannerImageSchema,
  type Banner,
  type CreateBannerInput,
  type ReorderBannersInput,
  type UpdateBannerInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createBanner,
  createUpload,
  deleteBanner,
  reorderBanners,
  updateBanner,
  uploadBannerImage,
  type SignedUploadResponse,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The `{entity}` key segment banner artwork lands under in R2
 * (`{gymId}/banners/{uuid}.jpg`).
 *
 * It has to be exactly this string and not a near-miss: the API's own
 * `SWEEPABLE_ENTITIES` allow-list (`apps/api/src/storage/media-key.ts`) names
 * `banners`, and an object uploaded under any other prefix would be invisible to
 * the nightly orphan sweep — kept forever, paid for forever.
 */
const BANNER_UPLOAD_ENTITY = 'banners';

/** Re-assert the Marketing write capability inside the action itself. */
async function requireManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.MarketingManage);
}

/** Map a thrown API error to a short, staff-facing message. */
async function toMessage(error: unknown): Promise<string> {
  const t = await getTranslations('admin.marketing');
  if (error instanceof ApiError) {
    if (error.message === 'BANNER_NOT_FOUND') {
      return t('errors.bannerNotFound');
    }
    return t('errors.requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/** "You may not do this" — the one refusal every action here shares. */
async function notAuthorized(): Promise<{ ok: false; error: string }> {
  const t = await getTranslations('admin.marketing');
  return { ok: false, error: t('errors.notAuthorized') };
}

/** The first schema complaint, or the generic "some details are invalid". */
async function invalid(message: string | undefined): Promise<{ ok: false; error: string }> {
  const t = await getTranslations('admin.marketing');
  return { ok: false, error: message ?? t('errors.invalidDetails') };
}

/** Refresh the banner manager after a mutation. */
function refresh(): void {
  revalidatePath('/marketing/banners');
}

/**
 * Create a banner. `imageUrl` is normally absent — the row is created first so the
 * artwork has an id to be attached to, which leaves it a DRAFT until
 * {@link finalizeBannerImageAction} runs. A draft never reaches the app, so a
 * half-finished create cannot show members a blank slide.
 */
export async function createBannerAction(input: CreateBannerInput): Promise<ActionResult<Banner>> {
  if (!(await requireManage())) {
    return notAuthorized();
  }
  const parsed = createBannerSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message);
  }
  try {
    const banner = await createBanner(parsed.data);
    refresh();
    return { ok: true, data: banner };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

/**
 * Edit a banner — only the keys present change, and `null` clears the nullable
 * ones. That distinction is the reason the drawer sends `null` rather than
 * omitting: "remove the end date" and "leave the end date alone" are different
 * requests and the API can tell them apart.
 */
export async function updateBannerAction(
  id: string,
  input: UpdateBannerInput,
): Promise<ActionResult<Banner>> {
  if (!(await requireManage())) {
    return notAuthorized();
  }
  const parsed = updateBannerSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message);
  }
  try {
    const banner = await updateBanner(id, parsed.data);
    refresh();
    return { ok: true, data: banner };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

/** Flip a banner's manual on/off switch — the one-field case of an edit. */
export async function toggleBannerAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult<Banner>> {
  return updateBannerAction(id, { isActive });
}

/**
 * Rearrange the reel: each id's position becomes its index in `ids`, applied in
 * one transaction so the carousel is never read half-rearranged. The console
 * sends the WHOLE list rather than the pair it moved — a partial list would
 * renumber only those rows and leave the rest colliding on their old positions.
 */
export async function reorderBannersAction(
  input: ReorderBannersInput,
): Promise<ActionResult<Banner[]>> {
  if (!(await requireManage())) {
    return notAuthorized();
  }
  const parsed = reorderBannersSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message);
  }
  try {
    const banners = await reorderBanners(parsed.data);
    refresh();
    return { ok: true, data: banners };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

/** Delete a banner; the API frees its artwork with it. */
export async function deleteBannerAction(id: string): Promise<ActionResult<{ id: string }>> {
  if (!(await requireManage())) {
    return notAuthorized();
  }
  try {
    await deleteBanner(id);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

/**
 * Mint a presigned R2 `PUT` URL for banner artwork — step one of the upload the
 * portal photograph established: presign here, `PUT` the bytes straight from the
 * browser, then finalise the key with {@link finalizeBannerImageAction}. Only the
 * two ends need a server, which is why the middle step is a bare `fetch` in the
 * client component.
 *
 * The owning gym is taken from the session by the API, never from this call, so
 * the key can only ever land under this tenant's own prefix.
 */
export async function requestBannerImageUploadAction(input: {
  contentType: string;
  contentLength: number;
  fileName?: string;
}): Promise<ActionResult<SignedUploadResponse>> {
  if (!(await requireManage())) {
    return notAuthorized();
  }
  try {
    const signed = await createUpload({ ...input, entity: BANNER_UPLOAD_ENTITY });
    return { ok: true, data: signed };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

/**
 * Attach an uploaded object to a banner by its `photoKey`: the API checks the key
 * belongs to this gym, turns it into a public URL, stores it, and frees whatever
 * artwork it replaced. Returns the updated row — which is what turns a draft into
 * a banner members can be shown.
 */
export async function finalizeBannerImageAction(
  id: string,
  photoKey: string,
): Promise<ActionResult<Banner>> {
  if (!(await requireManage())) {
    return notAuthorized();
  }
  const parsed = uploadBannerImageSchema.safeParse({ photoKey });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message);
  }
  try {
    const banner = await uploadBannerImage(id, parsed.data);
    refresh();
    return { ok: true, data: banner };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}
