export type BookingBlockReason = 'NO_SHOW_LIMIT';
export type BookingBlockLiftReason = 'STAFF' | 'CORRECTION';
export interface AdminBookingBlock {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  reason: BookingBlockReason;
  noShowCount: number;
  startsAt: string;
  endsAt: string;
  liftedAt: string | null;
  liftedByName: string | null;
  liftReason: BookingBlockLiftReason | null;
  active: boolean;
}
export interface MemberBookingStanding {
  cancellationCutoffHours: number;
  noShow: {
    active: boolean;
    limit: number;
    windowDays: number;
    blockDays: number;
    count: number;
    remaining: number | null;
  };
  block: { until: string; reason: BookingBlockReason } | null;
}
