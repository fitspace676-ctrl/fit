// @fit/mobile — the review composer. `POST /reviews`.
//
// ===========================================================================
// WHY IT IS A SHEET, AND WHY IT LIVES OFF THE BOOKINGS LIST.
//
// A member who has just been to a class looks for "how did that go?" where the
// class is — which on this app is `/profile/bookings`, the one screen that
// renders `account.bookings.status.ATTENDED`. The trainer profile is the
// *read* side and cannot host the write: a review names a **class occurrence**
// (`classInstanceId`), the trainer is derived server-side, and a trainer page
// does not know which of their occurrences the member attended. There is
// nothing on that screen a composer could be attached to.
//
// A sheet rather than a route because the composer is a focused action taken
// against a row that must stay behind it — the same call `FreezeSheet` and
// `BookingSheet` make. `Sheet` brings the keyboard avoidance, the hardware
// back, the scrim and `accessibilityViewIsModal` with it.
//
// ---------------------------------------------------------------------------
// THIS COMPONENT OWNS THE MUTATION.
//
// Same shape as `components/membership/freeze-sheet.tsx`: the screen owns
// *which* row is being composed against, and the sheet owns the request, the
// pending state and the outcome. That is what lets the two 4xx the API defines
// be handled where the form is, rather than in a screen that has four other
// jobs.
//
// The two outcomes it reports upward are both "this occurrence is now
// reviewed" — one from a `201`, one from a `409 ALREADY_REVIEWED`. The screen
// treats them identically, which is the point: see `review-form.ts` for why
// the 409 is a state rather than an error.

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Eyebrow,
  InlineNote,
  Sheet,
  StarRating,
  TextField,
  spacing,
  useToast,
} from '@fit/ui-mobile';

import { useCreateReview } from '../../hooks/mutations/useReviewMutations';
import { useI18n } from '../../providers/I18nProvider';
import {
  COMMENT_MAX,
  commentFits,
  emptyReview,
  hasRating,
  isAlreadyReviewed,
  isValidReview,
  reviewErrorKey,
  toReviewPayload,
  type ReviewDraft,
} from './review-form';

export interface ReviewSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * The occurrence being reviewed, or `null` when nothing is. `null` renders
   * nothing at all — there is no composer without a class to attach it to.
   */
  target: { classInstanceId: string; title: string; when: string } | null;
  /**
   * The server has confirmed this occurrence is reviewed — by accepting one
   * (`201`) or by refusing a second (`409`). Both mean the same thing to the
   * row behind the sheet.
   */
  onReviewed: (classInstanceId: string) => void;
  testID?: string;
}

/** Rate a class the member attended. */
export function ReviewSheet({
  open,
  onClose,
  target,
  onReviewed,
  testID = 'review-sheet',
}: ReviewSheetProps) {
  const { t, plural } = useI18n();
  const toast = useToast();
  const post = useCreateReview();

  const [draft, setDraft] = useState<ReviewDraft>(emptyReview);
  /** Has the member pressed Post on something the server would refuse? */
  const [showErrors, setShowErrors] = useState(false);

  // A fresh composer per opening. Without this, a member who rates one class
  // four stars, closes, and opens another finds the second pre-rated — and a
  // pre-filled rating is one they did not choose but would be posting.
  useEffect(() => {
    if (!open) return;
    setDraft(emptyReview());
    setShowErrors(false);
  }, [open, target?.classInstanceId]);

  if (target === null) return null;

  const valid = isValidReview(draft);
  const trimmed = draft.comment.trim().length;

  const note = !showErrors
    ? null
    : !hasRating(draft)
      ? t('member.reviews.pickRating')
      : !commentFits(draft)
        ? t('member.reviews.commentTooLong', { max: COMMENT_MAX })
        : null;

  function submit(): void {
    if (target === null || post.isPending) return;
    if (!valid) {
      // The handler RUNS on an invalid draft, so it can turn the explanation
      // on. A disabled button would have swallowed the press and said nothing.
      setShowErrors(true);
      return;
    }
    const classInstanceId = target.classInstanceId;
    post.mutate(toReviewPayload(classInstanceId, draft), {
      onSuccess: () => {
        // `CreateReviewResponse` is `{ id }` and nothing else. The trainer's
        // recomputed average arrives through the invalidation matrix
        // (`createReview` → the whole `trainers` root), not from here.
        toast.success(t('member.reviews.posted'));
        onReviewed(classInstanceId);
        onClose();
      },
      onError: (error: unknown) => {
        if (isAlreadyReviewed(error)) {
          // Not an error the member can act on — and pressing Post again can
          // never work. Say it once, mark the row, and close the form rather
          // than leaving them looking at a draft with nowhere to go.
          toast.error(t('member.reviews.already'));
          onReviewed(classInstanceId);
          onClose();
          return;
        }
        toast.error(t(reviewErrorKey(error)));
      },
    });
  }

  return (
    <Sheet
      testID={testID}
      open={open}
      onClose={() => {
        if (!post.isPending) onClose();
      }}
      title={t('member.reviews.title')}
      subtitle={`${target.title} · ${target.when}`}
      // TODO(i18n): no namespace-neutral "Close" exists — `classes.modal.close`
      // is the closest real, translated string, and is what
      // `components/settings/sign-out-section.tsx` uses for the same reason.
      closeAccessibilityLabel={t('classes.modal.close')}
      footer={
        <Button
          testID={`${testID}-submit`}
          label={t('member.reviews.submit')}
          busyLabel={t('member.reviews.submitting')}
          busy={post.isPending}
          icon="star"
          fullWidth
          // LIVE, always: `busy` is not `disabled`, and a button disabled for
          // being incomplete can never say what is missing.
          onPress={submit}
        />
      }
    >
      <View style={{ gap: spacing[4] }}>
        <View style={{ gap: spacing[2] }}>
          {/* The same 10px micro-label `TextField` draws, so the two controls
              in this sheet look like one form. `accessible={false}`: the
              `StarRating` under it already carries this string as its
              accessible name, and a visible copy would announce it twice. */}
          <Eyebrow size="micro" color="textSecondary" accessible={false}>
            {t('member.reviews.ratingLabel')}
          </Eyebrow>
          <StarRating
            testID={`${testID}-rating`}
            value={draft.rating}
            onChange={(rating) => {
              setDraft((current) => ({ ...current, rating }));
            }}
            disabled={post.isPending}
            labels={{
              value: t('member.reviews.ratingLabel'),
              // The WHOLE spoken sentence — five glyphs cannot be composed into
              // one, and a percentage derived from min/now/max is nonsense for
              // a rating.
              valueText: (rating) => t('member.reviews.ratingValue', { rating }),
              empty: t('member.reviews.ratingEmpty'),
              star: (rating) => plural('member.reviews.star', rating),
              hint: t('member.reviews.ratingHint'),
            }}
          />
        </View>

        <TextField
          testID={`${testID}-comment`}
          label={t('member.reviews.comment')}
          placeholder={t('member.reviews.commentPlaceholder')}
          value={draft.comment}
          multiline
          maxLength={COMMENT_MAX}
          numberOfLines={4}
          hint={t('member.reviews.commentCount', { count: trimmed, max: COMMENT_MAX })}
          {...(showErrors && !commentFits(draft)
            ? { error: t('member.reviews.commentTooLong', { max: COMMENT_MAX }) }
            : {})}
          onChangeText={(comment) => {
            setDraft((current) => ({ ...current, comment }));
          }}
        />

        {note === null ? null : (
          <InlineNote testID={`${testID}-note`} icon="info" live>
            {note}
          </InlineNote>
        )}
      </View>
    </Sheet>
  );
}
