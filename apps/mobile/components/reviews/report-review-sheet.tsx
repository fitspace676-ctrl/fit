// Report copy belongs to member.reviews.report; the trainer read-side keeps
// its existing trainers.detail.reviews namespace.
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewReportReasonSchema, type ReportReviewData } from '@fit/types';
import { Button, InlineNote, Sheet, TextField, spacing } from '@fit/ui-mobile';
import { reportReview } from '../../lib/api/reviews';
import { useI18n } from '../../providers/I18nProvider';

export function ReportReviewSheet({
  reviewId,
  onClose,
  onReported,
}: {
  reviewId: string;
  onClose: () => void;
  onReported: (id: string) => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [reason, setReason] = useState<ReportReviewData['reason'] | null>(null);
  const [note, setNote] = useState('');
  const submitting = useRef(false);
  const post = useMutation({
    mutationFn: (input: ReportReviewData) => reportReview(reviewId, input),
    onSuccess: () => {
      onReported(reviewId);
      void client.invalidateQueries({ queryKey: ['trainers'] });
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  return (
    <Sheet
      open
      onClose={() => {
        if (!submitting.current) onClose();
      }}
      title={t('member.reviews.report.title')}
      closeAccessibilityLabel={t('classes.modal.close')}
      footer={
        post.isSuccess ? undefined : (
          <Button
            testID="report-submit"
            label={t('member.reviews.report.submit')}
            busyLabel={t('member.reviews.report.submitting')}
            busy={post.isPending}
            disabled={reason === null}
            fullWidth
            onPress={() => {
              if (reason === null || submitting.current) return;
              submitting.current = true;
              post.mutate({ reason, ...(note.trim() ? { note: note.trim() } : {}) });
            }}
          />
        )
      }
    >
      {post.isSuccess ? (
        <InlineNote live icon="info" testID="report-success">
          {t('member.reviews.report.sent')}
        </InlineNote>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {reviewReportReasonSchema.options.map((value) => (
            <Button
              key={value}
              testID={`report-reason-${value}`}
              label={t(`member.reviews.report.reasons.${value}`)}
              variant={reason === value ? 'primary' : 'secondary'}
              disabled={post.isPending}
              onPress={() => setReason(value)}
            />
          ))}
          <TextField
            testID="report-note"
            label={t('member.reviews.report.note')}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            disabled={post.isPending}
          />
          {post.isError ? (
            <InlineNote live icon="info">
              {t('member.reviews.report.error')}
            </InlineNote>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
