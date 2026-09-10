// The review composer's transforms, and the error map under them.
//
// The assertions worth reading twice are the two 4xx: `NOT_ATTENDED` and
// `ALREADY_REVIEWED` are branched on by `code`, never by status, because
// `apps/api`'s exception filter decouples the two deliberately and `message`
// is server-authored prose that is reworded without notice.
//
// A `.test.tsx` under jest-expo rather than a `.spec.ts` under Vitest for the
// placement reason `components/profile/profile-form.test.tsx` gives.

import { ApiError } from '../../lib/http/api-error';
import {
  COMMENT_MAX,
  RATING_MAX,
  RATING_MIN,
  commentFits,
  emptyReview,
  hasRating,
  isAlreadyReviewed,
  isNotAttended,
  isValidReview,
  reviewErrorKey,
  toReviewPayload,
} from './review-form';

describe('the draft', () => {
  it('starts unrated, which is not a rating any request may carry', () => {
    const draft = emptyReview();
    expect(draft).toEqual({ rating: 0, comment: '' });
    expect(hasRating(draft)).toBe(false);
    expect(isValidReview(draft)).toBe(false);
  });

  it('accepts the integers 1–5 and nothing else', () => {
    for (const rating of [RATING_MIN, 2, 3, 4, RATING_MAX]) {
      expect(hasRating({ rating, comment: '' })).toBe(true);
    }
    for (const rating of [0, -1, 6, 3.5, Number.NaN]) {
      expect(hasRating({ rating, comment: '' })).toBe(false);
    }
  });

  it('measures the comment cap after trimming, as the schema does', () => {
    expect(commentFits({ rating: 4, comment: 'ა'.repeat(COMMENT_MAX) })).toBe(true);
    expect(commentFits({ rating: 4, comment: `  ${'ა'.repeat(COMMENT_MAX)}  ` })).toBe(true);
    expect(commentFits({ rating: 4, comment: 'ა'.repeat(COMMENT_MAX + 1) })).toBe(false);
  });

  it('is valid on a bare star rating — a comment is optional', () => {
    expect(isValidReview({ rating: 5, comment: '' })).toBe(true);
  });
});

describe('toReviewPayload', () => {
  it('carries the occurrence, not the trainer', () => {
    // The trainer is derived server-side from the occurrence and is never sent
    // by the client — which is also why the composer has to be launched from a
    // booking row rather than from a trainer page.
    expect(toReviewPayload('ci_1', { rating: 5, comment: 'ძალიან კარგი იყო' })).toEqual({
      classInstanceId: 'ci_1',
      rating: 5,
      comment: 'ძალიან კარგი იყო',
    });
  });

  it('OMITS a blank comment rather than sending an empty string', () => {
    // `.optional()` with a transform that maps '' to undefined — an absent key
    // is the only shape the type accepts, and `null` is not one of them.
    expect(toReviewPayload('ci_1', { rating: 4, comment: '   ' })).toEqual({
      classInstanceId: 'ci_1',
      rating: 4,
    });
    expect(Object.keys(toReviewPayload('ci_1', { rating: 4, comment: '' }))).not.toContain(
      'comment',
    );
  });

  it('trims what it does send', () => {
    expect(toReviewPayload('ci_1', { rating: 3, comment: '  კარგი  ' }).comment).toBe('კარგი');
  });
});

// ===========================================================================
// The two refusals, read by `code`.
// ===========================================================================
describe('the API refusals', () => {
  it('recognises ALREADY_REVIEWED, which the screen renders as a state', () => {
    const error = new ApiError({ status: 409, code: 'ALREADY_REVIEWED' });
    expect(isAlreadyReviewed(error)).toBe(true);
    expect(isNotAttended(error)).toBe(false);
    expect(reviewErrorKey(error)).toBe('member.reviews.already');
  });

  it('recognises NOT_ATTENDED, which a correctly-drawn screen never provokes', () => {
    const error = new ApiError({ status: 403, code: 'NOT_ATTENDED' });
    expect(isNotAttended(error)).toBe(true);
    expect(isAlreadyReviewed(error)).toBe(false);
    expect(reviewErrorKey(error)).toBe('member.reviews.errNotAttended');
  });

  it('does not branch on status — a 409 that is not ALREADY_REVIEWED is generic', () => {
    const error = new ApiError({ status: 409, code: 'CONFLICT' });
    expect(isAlreadyReviewed(error)).toBe(false);
    expect(reviewErrorKey(error)).toBe('member.actions.errGeneric');
  });

  it('maps the occurrence and session codes the controller documents', () => {
    expect(reviewErrorKey(new ApiError({ status: 404, code: 'CLASS_INSTANCE_NOT_FOUND' }))).toBe(
      'member.reviews.errNotFound',
    );
    expect(reviewErrorKey(new ApiError({ status: 403, code: 'MEMBER_SESSION_REQUIRED' }))).toBe(
      'member.actions.errAuth',
    );
    expect(reviewErrorKey(new ApiError({ status: 403, code: 'NOT_A_MEMBER' }))).toBe(
      'member.actions.errAuth',
    );
  });

  it('falls back for a transport failure and for a non-ApiError', () => {
    expect(reviewErrorKey(new ApiError({ status: 0, code: 'NETWORK_TIMEOUT' }))).toBe(
      'member.actions.errGeneric',
    );
    expect(reviewErrorKey(new Error('boom'))).toBe('member.actions.errGeneric');
    expect(isAlreadyReviewed(new Error('boom'))).toBe(false);
  });
});
