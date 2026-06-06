import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { BookingOutcome, ClassInstanceDetail, MemberBookingHistoryEntry } from '@fit/types';
import { useI18n, useTheme, useToast } from '../../providers';
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
 * The class-detail screen's Book / Waitlist / Cancel action area (T6.4).
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
  const { colors } = useTheme();
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
      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (liveBooking) {
    const isWaitlist = liveBooking.status === 'WAITLIST';
    return (
      <View style={{ gap: 12 }}>
        <View
          style={{
            gap: 4,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
            {t(
              isWaitlist
                ? 'classes.detail.booking.waitlistedTitle'
                : 'classes.detail.booking.bookedTitle',
            )}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            {t(
              isWaitlist
                ? 'classes.detail.booking.waitlistedSubtitle'
                : 'classes.detail.booking.bookedSubtitle',
            )}
          </Text>
          {isWaitlist && liveBooking.waitlistPosition != null ? (
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
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
          colors={colors}
          onPress={() => void onCancel()}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {isFull ? (
        <Text style={{ fontSize: 13, color: colors.textMuted }}>
          {t('classes.detail.booking.fullNote')}
        </Text>
      ) : null}
      <ActionButton
        label={t(isFull ? 'classes.detail.booking.joinWaitlist' : 'classes.detail.booking.book')}
        pendingLabel={t('classes.detail.booking.booking')}
        pending={book.isPending}
        disabled={busy}
        variant="primary"
        colors={colors}
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

interface ActionButtonColors {
  primary: string;
  onPrimary: string;
  border: string;
  text: string;
}

/** A full-width primary / danger action button with an inline pending spinner. */
function ActionButton({
  label,
  pendingLabel,
  pending,
  disabled,
  variant,
  colors,
  onPress,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled: boolean;
  variant: 'primary' | 'danger';
  colors: ActionButtonColors;
  onPress: () => void;
}) {
  const isDanger = variant === 'danger';
  const textColor = isDanger ? '#dc2626' : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: pending }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: isDanger ? 1 : 0,
        borderColor: isDanger ? '#dc2626' : 'transparent',
        backgroundColor: isDanger ? 'transparent' : colors.primary,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {pending ? <ActivityIndicator size="small" color={textColor} /> : null}
      <Text style={{ fontSize: 15, fontWeight: '700', color: textColor }}>
        {pending ? pendingLabel : label}
      </Text>
    </Pressable>
  );
}
