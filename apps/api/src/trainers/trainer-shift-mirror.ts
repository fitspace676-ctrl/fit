import { WEEKDAYS, type WeeklyAvailability } from '@fit/types';

/**
 * The narrow model surface {@link mirrorAvailabilityToShifts} needs.
 *
 * Hand-written rather than `Prisma.TransactionClient` for the reason
 * `PromoTransactionClient` and `CreditPackTransactionClient` are: the tenant-
 * **extended** client is not assignable to Prisma's own transaction type. Narrow
 * enough that the transaction client satisfies it structurally, so callers pass
 * `tx` straight in with no cast.
 */
export interface ShiftMirrorClient {
  shiftSlot: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
}

/**
 * Project a coach's weekly availability onto the staff shift schedule.
 *
 * A coach's hours were stored twice and written once each. `Trainer.availability`
 * is what the Availability tab edits and what trainer utilization divides by;
 * `ShiftSlot` is what the Staff profile, Who's-working, the shift-coverage report
 * and the dashboard rota all read. Adding a coach on Trainers left the second
 * blank, adding one on Staff left the first blank, and neither screen said so.
 *
 * The fix is not to sync two writers - it is to have one. Availability is the
 * source: it is what the coach's own screen edits, and the only one of the two
 * that can express a split day. Every write of it lands here, so the two cannot
 * disagree. The Staff drawer's hours editor is read-only for a coach precisely so
 * that no second writer exists.
 *
 * Set-based, matching the staff schedule editor: the coach's whole week is
 * replaced, never patched. `location` is left null - `ShiftSlot` carries one and
 * availability does not, so there is nothing truthful to put there.
 *
 * `dayOfWeek` is 0 = Monday … 6 = Sunday, which is exactly `WEEKDAYS`' order, so
 * the day index is the array index and no Sunday-first conversion is involved.
 */
export async function mirrorAvailabilityToShifts(
  db: ShiftMirrorClient,
  {
    gymId,
    staffId,
    availability,
  }: { gymId: string; staffId: string; availability: WeeklyAvailability },
): Promise<void> {
  const rows = WEEKDAYS.flatMap((day, dayOfWeek) => {
    const value = availability[day];
    if (!value.available) return [];
    return value.windows.map((window) => ({
      gymId,
      staffId,
      dayOfWeek,
      startTime: window.start,
      endTime: window.end,
    }));
  });

  await db.shiftSlot.deleteMany({ where: { staffId } });
  if (rows.length > 0) {
    await db.shiftSlot.createMany({ data: rows });
  }
}
