// @fit/mobile — a review, before it is a request.
//
// ===========================================================================
// THE TWO REFUSALS, AND WHICH OF THEM THE CLIENT CAN SEE COMING.
//
// `POST /reviews` refuses a review for two member-facing reasons, and they are
// not symmetric:
//
//   * **403 `NOT_ATTENDED`** — no `ATTENDED` booking for that occurrence. This
//     one is *fully knowable client-side*: `GET /me/bookings` already carries
//     `status`, so the composer is only ever offered on a row whose status is
//     `ATTENDED`. The error arm below therefore exists for a race (the status
//     flipped under the member, or an admin corrected it), not for the normal
//     path — a member should never meet it by pressing a button we drew.
//
//   * **409 `ALREADY_REVIEWED`** — one review per (member, occurrence),
//     enforced by a unique constraint as well as a pre-check, so a
//     double-submit race gets the same 409 rather than two rows. This one is
//     **not** knowable before the attempt, and the reason is worth stating
//     because it looks like an oversight: there is no member-reachable route
//     that lists the caller's own reviews. `POST /reviews` is the only write;
//     `GET /trainers/:id/reviews` is the only read, it is `@Public()`, and its
//     projection (`publicReviewSchema`) carries `authorName` — a display name —
//     and no member id and no `classInstanceId`. Matching on a display name
//     would be a guess, and a wrong guess in the direction that HIDES a control
//     the member is entitled to.
//
// So the 409 is rendered as a **state**, not as an error: the row it came from
// flips to "you have already reviewed this class" and stays that way for the
// visit. The member learns it once, from the server, and is not invited to
// write the same review again — which is the closest thing to "legible before
// you write anything" that this API supports.
//
// ---------------------------------------------------------------------------
// WHY THE SET OF REVIEWED OCCURRENCES IS SCREEN STATE AND NOT A STORE.
//
// It is deliberately NOT persisted and deliberately not module-global.
// `components/notifications/device-prefs.ts` argues the general case at
// length; the specific one here is sharper. A persisted set would have to be
// keyed by user id or it would tell member B, on a shared device, that they had
// already reviewed a class member A reviewed — a false positive that REMOVES a
// control, and the only failure direction that actually costs someone
// something. Keeping it in the screen's own state makes that impossible, and
// costs a member who navigates away and back one extra 409 they will only ever
// see once.

import type { CreateReviewData } from '@fit/types';
import { ApiError } from '../../lib/http/api-error';
import type { MessageKey } from '../../lib/i18n/keys';

/** `comment: z.string().trim().max(2000)`. Empty normalises to absent server-side. */
export const COMMENT_MAX = 2000;

/** `rating: z.coerce.number().int().min(1).max(5)`. No half stars, mirrored by a DB CHECK. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** What the composer holds while it is being written. */
export interface ReviewDraft {
  /** `0` until the member picks — not a rating any request may carry. */
  readonly rating: number;
  readonly comment: string;
}

/** A blank composer. */
export function emptyReview(): ReviewDraft {
  return { rating: 0, comment: '' };
}

/** Has the member chosen a rating the server would accept? */
export function hasRating(draft: ReviewDraft): boolean {
  return Number.isInteger(draft.rating) && draft.rating >= RATING_MIN && draft.rating <= RATING_MAX;
}

/** Is the comment within the cap, measured after trimming as the schema measures it? */
export function commentFits(draft: ReviewDraft): boolean {
  return draft.comment.trim().length <= COMMENT_MAX;
}

/** Is the whole draft postable? */
export function isValidReview(draft: ReviewDraft): boolean {
  return hasRating(draft) && commentFits(draft);
}

/**
 * The `POST /reviews` body. Call only when {@link isValidReview}.
 *
 * `comment` is **omitted**, not `null`, when blank: the schema is
 * `.optional()` and its transform maps an empty string to `undefined`, so an
 * absent key and a whitespace-only string mean the same thing to the server —
 * but only the absent key is something the type accepts.
 */
export function toReviewPayload(classInstanceId: string, draft: ReviewDraft): CreateReviewData {
  const comment = draft.comment.trim();
  return {
    classInstanceId,
    rating: draft.rating,
    ...(comment === '' ? {} : { comment }),
  };
}

/**
 * Did the server say this occurrence has already been reviewed?
 *
 * Its own predicate rather than an arm of {@link reviewErrorKey} because the
 * screen does something *different* with it: the row changes state, and the
 * composer closes. A sentence in a toast would leave the member looking at a
 * form they can never submit.
 */
export function isAlreadyReviewed(error: unknown): boolean {
  return ApiError.is(error) && error.code === 'ALREADY_REVIEWED';
}

/** Did the server refuse because there is no `ATTENDED` booking? */
export function isNotAttended(error: unknown): boolean {
  return ApiError.is(error) && error.code === 'NOT_ATTENDED';
}

/**
 * The catalogue key for a failed post.
 *
 * By `code`, never by status — the exception filter decouples the two on
 * purpose and `message` is server-authored prose. Same shape and same argument
 * as `components/classes/booking-errors.ts`.
 */
export function reviewErrorKey(error: unknown): MessageKey {
  if (!ApiError.is(error)) return 'member.actions.errGeneric';

  switch (error.code) {
    case 'ALREADY_REVIEWED':
      return 'member.reviews.already';
    case 'NOT_ATTENDED':
      return 'member.reviews.errNotAttended';
    case 'CLASS_INSTANCE_NOT_FOUND':
    case 'NOT_FOUND':
      return 'member.reviews.errNotFound';
    case 'UNAUTHENTICATED':
    case 'UNAUTHORIZED':
    case 'MEMBER_SESSION_REQUIRED':
    case 'NOT_A_MEMBER':
      return 'member.actions.errAuth';
    default:
      // Every 5xx, every transport failure, and a `VALIDATION_ERROR` the
      // composer's own rules should have caught first.
      return 'member.actions.errGeneric';
  }
}
