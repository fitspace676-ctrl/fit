import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { BookingOutcome, ClassInstanceDetail, MemberBookingHistoryEntry } from '@fit/types';
import { useI18n, useToast } from '../../providers';
import { useBookingActions } from '../../hooks/useBookingActions';

export interface ClassBookingActionsProps {
  /** The occurrence being shown — supplies the id and live seat totals. */
  instance: ClassInstanceDetail;
  /** Active gym scope, for the mutations' cache invalidation. */
  gymId: string | null;
  /** The caller's live booking for this occurrence, or `null` when they hold
   * none — decides Book / Join waitlist vs Cancel / Leave waitlist. */
  liveBooking: MemberBookingHistoryEntry | null;
  /** Whether the member-bookings query that resolves `liveBooking` is still
   * loading — the action area shows a spinner until the state is known, so it
   * never flashes "Book" for a class the member has already booked. */
  bookingsLoading: boolean;
}

/**
 * The class-detail screen's Book / Waitlist / Cancel action area — restyled to
 * the formacore "Aurora Glass" dark identity (T7.4, member-classdetail-mobile
 * artboard). Frosted `white/5` status cards on the `ink-950` canvas, a solid
 * `brand-600` primary CTA, and a translucent danger outline for the destructive
 * cancel / leave-waitlist action. Dark-only, matching the redesigned schedule
 * (T7.3) and home (T7.2) tabs.
 *
 * Reads the caller's live booking to pick the action:
 *   • no booking, seats free   → "Book this class"
 *   • no booking, class full    → a waitlist note + "Join waitlist"
 *   • a confirmed seat (BOOKED) → a "you're booked" card + "Cancel booking"
 *   • a waitlist place          → position + "Leave waitlist"
 *
 * Each action awaits its mutation and toasts the outcome (a booking can land as
 * BOOKED *or* WAITLIST depending on live capacity, so the toast is keyed off the
 * server's result, not the button pressed). The button shows a spinner and is
 * disabled while its mutation is in flight. Mounted only for a `SCHEDULED`
 * occurrence — the screen withholds it for a canceled / completed class.
 */
export function ClassBookingActions({
  instance,
  gymId,
  liveBooking,
  bookingsLoading,
}: ClassBookingActionsProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { book, cancel } = useBookingActions(gymId, instance.id);

  const isFull = Math.max(instance.capacity - instance.bookedCount, 0) === 0;
  const busy = book.isPending || cancel.isPending;

  const onBook = async (): Promise<void> => {
    try {
      const result = await book.mutateAsync();
      toast.success(t(outcomeToastKey(result.status)));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  };

  const onCancel = async (): Promise<void> => {
    const wasWaitlist = liveBooking?.status === 'WAITLIST';
    try {
      await cancel.mutateAsync();
      toast.success(
        t(
          wasWaitlist
            ? 'classes.detail.booking.toast.leftWaitlist'
            : 'classes.detail.booking.toast.canceled',
        ),
      );
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  };

  // Still resolving whether the member already holds a booking — keep the area
  // quiet rather than flashing the wrong action.
  if (bookingsLoading) {
    return (
      <View className="items-center py-4">
        <ActivityIndicator color="#9184F1" />
      </View>
    );
  }

  if (liveBooking) {
    const isWaitlist = liveBooking.status === 'WAITLIST';
    return (
      <View className="gap-3">
        <View className="overflow-hidden rounded-card border border-white/10 bg-white/5 p-4">
          <View className="absolute inset-x-0 top-0 h-px bg-white/10" />
          <View className="flex-row items-center gap-2">
            <View
              className={`h-1.5 w-1.5 rounded-full ${isWaitlist ? 'bg-warning-400' : 'bg-success-400'}`}
            />
            <Text className="text-[15px] font-bold text-white">
              {t(
                isWaitlist
                  ? 'classes.detail.booking.waitlistedTitle'
                  : 'classes.detail.booking.bookedTitle',
              )}
            </Text>
          </View>
          <Text className="mt-1.5 text-[13px] text-ink-400">
            {t(
              isWaitlist
                ? 'classes.detail.booking.waitlistedSubtitle'
                : 'classes.detail.booking.bookedSubtitle',
            )}
          </Text>
          {isWaitlist && liveBooking.waitlistPosition != null ? (
            <Text className="mt-2 font-mono text-[13px] font-semibold text-brand-300">
              {t('classes.detail.booking.waitlistPosition', {
                position: liveBooking.waitlistPosition,
              })}
            </Text>
          ) : null}
        </View>

        <ActionButton
          label={t(
            isWaitlist ? 'classes.detail.booking.leaveWaitlist' : 'classes.detail.booking.cancel',
          )}
          pendingLabel={t('classes.detail.booking.canceling')}
          pending={cancel.isPending}
          disabled={busy}
          variant="danger"
          onPress={() => void onCancel()}
        />
      </View>
    );
  }

  return (
    <View className="gap-3">
      {isFull ? (
        <Text className="text-[13px] text-ink-400">{t('classes.detail.booking.fullNote')}</Text>
      ) : null}
      <ActionButton
        testID="class-book-button"
        label={t(isFull ? 'classes.detail.booking.joinWaitlist' : 'classes.detail.booking.book')}
        pendingLabel={t('classes.detail.booking.booking')}
        pending={book.isPending}
        disabled={busy}
        variant="primary"
        onPress={() => void onBook()}
      />
    </View>
  );
}

/** Toast key for a fresh booking's outcome — a confirmed seat vs a waitlist place. */
function outcomeToastKey(status: BookingOutcome): string {
  return status === 'WAITLIST'
    ? 'classes.detail.booking.toast.waitlisted'
    : 'classes.detail.booking.toast.booked';
}

/** The API's error message when present, else the generic booking-error toast. */
function errorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return t('classes.detail.booking.toast.error');
}

/** A full-width primary / danger action button with an inline pending spinner,
 * in the Aurora Glass palette (solid `brand-600` primary, translucent danger
 * outline). */
function ActionButton({
  label,
  pendingLabel,
  pending,
  disabled,
  variant,
  onPress,
  testID,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled: boolean;
  variant: 'primary' | 'danger';
  onPress: () => void;
  /** Stable identifier for end-to-end (Maestro) selectors. */
  testID?: string;
}) {
  const isDanger = variant === 'danger';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: pending }}
      disabled={disabled}
      onPress={onPress}
      className={`h-14 flex-row items-center justify-center gap-2 rounded-btn ${
        isDanger
          ? 'border border-danger-500/40 bg-danger-500/10 active:bg-danger-500/20'
          : 'bg-brand-600 active:bg-brand-700'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {pending ? <ActivityIndicator size="small" color={isDanger ? '#FDA29B' : '#FFFFFF'} /> : null}
      <Text className={`text-[15px] font-bold ${isDanger ? 'text-danger-300' : 'text-white'}`}>
        {pending ? pendingLabel : label}
      </Text>
    </Pressable>
  );
}
