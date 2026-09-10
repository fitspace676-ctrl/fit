// @fit/types — home-screen promotional banner contracts (Zod schemas + inferred types).
//
// Two audiences, two shapes, one table (T1.16):
//
//   * The staff console authors banners at `/marketing/banners` and sees the whole
//     row — the scheduling window, the on/off switch, the sort position, the
//     timestamps. That is {@link bannerSchema}.
//   * The member app renders whatever is live right now at `GET /banners?gymId=…`
//     and needs four fields to draw a slide. That is {@link publicBannerSchema}.
//
// The public projection is deliberately NOT `bannerSchema.pick(…)`-adjacent by
// accident: it is a separate, smaller object so that adding an internal field
// (an audience rule, a click counter) cannot widen the unauthenticated response
// by omission. Whether a banner is live is decided server-side and never sent —
// the app receives the reel it should draw, not the rules that produced it.

import { z } from 'zod';

/** The longest a banner headline may be — a phone-width overlay, not a paragraph. */
const TITLE_MAX = 120;

/**
 * Where a banner tap goes. Deliberately a bare trimmed string rather than
 * `z.string().url()`: an in-app deep link (`/shop/product/abc`, `fit://classes`)
 * is a perfectly good destination and is not a URL. The mobile client decides how
 * to open it; the API only stores it. `null` is a slide that does nothing when
 * tapped, which is the normal state for an announcement.
 */
const linkUrlSchema = z.string().trim().min(1).max(2048);

/**
 * One banner as the staff console reads it — the full row. `imageUrl` is the
 * public R2 URL of the artwork; a banner always has one, since it is the slide.
 * `startsAt` / `endsAt` are ISO instants bounding the scheduled run, either end
 * `null` for unbounded. `isActive` is the separate manual switch: a banner is
 * shown to members only when it is active AND inside its window.
 */
export const bannerSchema = z.object({
  id: z.string().min(1),
  gymId: z.string().min(1),
  title: z.string().nullable(),
  imageUrl: z.string().min(1),
  linkUrl: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** One banner row on the staff console — {@link bannerSchema}. */
export type Banner = z.infer<typeof bannerSchema>;

/**
 * Successful `GET /marketing/banners` response — every banner the gym has, live
 * or not, in carousel order (`sortOrder` ascending, then oldest first). An empty
 * array is a normal `200`, which the console renders as its empty state.
 */
export interface ListBannersResponse {
  banners: Banner[];
}

/** Successful `GET /marketing/banners/:id` / create / update response. */
export interface BannerResponse {
  banner: Banner;
}

/**
 * Body of `POST /marketing/banners`.
 *
 * `imageUrl` is optional here on purpose: the console creates the row first and
 * finalises the artwork with `POST /marketing/banners/:id/image` (the presigned
 * upload has to name something to attach to). A banner with an empty `imageUrl`
 * is a draft — the member listing skips it, so a half-created row can never reach
 * the app as a blank slide.
 */
export const createBannerSchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX).nullable().optional(),
    imageUrl: z.string().trim().min(1).max(2048).optional(),
    linkUrl: linkUrlSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().default(true),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
  })
  .superRefine(refineWindow);

/** Validated `POST /marketing/banners` body — {@link createBannerSchema}. */
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

/**
 * Body of `PATCH /marketing/banners/:id` — every field optional; only the keys
 * present change. Sending `null` for `title` / `linkUrl` / `startsAt` / `endsAt`
 * clears them, while omitting the key leaves them alone, so "remove the end date"
 * and "don't touch the end date" are distinguishable.
 */
export const updateBannerSchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX).nullable().optional(),
    imageUrl: z.string().trim().min(1).max(2048).optional(),
    linkUrl: linkUrlSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
  })
  .superRefine(refineWindow);

/** Validated `PATCH /marketing/banners/:id` body — {@link updateBannerSchema}. */
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

/**
 * Reject a window that ends before it starts — but only when the request carries
 * BOTH ends. A patch that moves one end alone is checked against the stored row by
 * the service, which is the only place the other end is known.
 */
function refineWindow(
  value: { startsAt?: string | null; endsAt?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (!value.startsAt || !value.endsAt) return;
  if (new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'endsAt must be after startsAt',
      path: ['endsAt'],
    });
  }
}

/**
 * Body of `POST /marketing/banners/:id/image` — the R2 object `photoKey` of an
 * already-uploaded image, mirroring the gym logo / portal image finalise flow.
 * The client `PUT`s the file to the presigned URL `POST /uploads` mints (with
 * `entity: 'banners'`), then names the key here to attach it to the banner.
 */
export const uploadBannerImageSchema = z.object({
  photoKey: z.string().trim().min(1),
});

/** Validated `POST /marketing/banners/:id/image` body. */
export type UploadBannerImageInput = z.infer<typeof uploadBannerImageSchema>;

/** Successful `POST /marketing/banners/:id/image` response — the whole updated row. */
export type UploadBannerImageResponse = BannerResponse;

/**
 * Body of `PATCH /marketing/banners/reorder` — the ids in the order the console's
 * drag-and-drop left them. Each banner's `sortOrder` becomes its index in this
 * array, applied in one transaction, so a reel never renders half-rearranged.
 *
 * Every id must belong to the gym; an unknown one is a `404` and nothing is
 * written. Sending a partial list is allowed (the named banners take positions
 * `0…n-1`), but the console sends the whole reel.
 */
export const reorderBannersSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

/** Validated `PATCH /marketing/banners/reorder` body — {@link reorderBannersSchema}. */
export type ReorderBannersInput = z.infer<typeof reorderBannersSchema>;

/** Successful `PATCH /marketing/banners/reorder` response — the reel, reordered. */
export type ReorderBannersResponse = ListBannersResponse;

/**
 * One banner as the member app draws it — four fields, no scheduling metadata.
 * `linkUrl` is `null` for a slide that is not tappable; `title` is `null` for an
 * image-only slide. Whether the banner should be shown at all was decided by the
 * API before it reached this shape.
 */
export const publicBannerSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  imageUrl: z.string().min(1),
  linkUrl: z.string().nullable(),
});

/** One slide of the member app's home carousel — {@link publicBannerSchema}. */
export type PublicBanner = z.infer<typeof publicBannerSchema>;

/**
 * Query for `GET /banners`. `gymId` scopes the listing to one tenant — the app
 * resolves it from its configured slug before any session exists, exactly as the
 * public trainers / products listings do, which is why this route carries no
 * session of its own.
 */
export const listPublicBannersQuerySchema = z.object({
  gymId: z.string().min(1),
});

/** Validated `GET /banners` query — {@link listPublicBannersQuerySchema}. */
export type ListPublicBannersQuery = z.infer<typeof listPublicBannersQuerySchema>;

/**
 * Successful `GET /banners` response — the gym's live banners in carousel order.
 * An empty array is a normal `200` (no banners, or none running right now), which
 * the app renders by hiding the carousel entirely rather than showing a gap.
 */
export interface ListPublicBannersResponse {
  banners: PublicBanner[];
}
