import {
  BadRequestException,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  Permission,
  idempotencyKeySchema,
  type BookClassInstanceResponse,
  type CancelBookingResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { BookingsService } from './bookings.service';

/**
 * Member class-booking endpoint (`POST /class-instances/:id/bookings`, T5.4).
 *
 * Distinct from the `@Public()` discovery {@link ClassesController} on the same
 * `class-instances` prefix: booking is an authenticated, tenant-scoped member
 * action, so it sits behind {@link TenantGuard} + the global {@link
 * PermissionsGuard} and requires {@link Permission.ClassBook} (granted to the
 * `MEMBER` role). The member books *themselves* — the booking's member is the
 * caller's own gym membership, never a value off the wire — so the request has
 * no body; the only optional input is the `Idempotency-Key` header.
 */
@Controller('class-instances')
@UseGuards(TenantGuard, PermissionsGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /**
   * `POST /class-instances/:id/bookings` — book the calling member into the
   * occurrence (or, when it is full, queue them onto its waitlist). The optional
   * `Idempotency-Key` header makes a retry safe: a repeat with the same key
   * returns the original booking instead of taking a second seat.
   *
   * Returns `200 OK` (not `201`) on both the first call and an idempotent replay,
   * so a retried request gets a byte-identical response — the create-vs-replay
   * distinction is carried in the body's `idempotentReplay` flag, not the status
   * code. A full occurrence is still a success (`status: 'WAITLIST'`); the failure
   * modes are `404` (unknown occurrence), `409 CLASS_NOT_BOOKABLE` (canceled /
   * completed), `409 ALREADY_BOOKED`, and `409 IDEMPOTENCY_KEY_REUSED`.
   */
  @Post(':id/bookings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassBook)
  async book(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BookClassInstanceResponse> {
    return this.bookings.book(id, parseIdempotencyKey(idempotencyKey));
  }

  /**
   * `DELETE /class-instances/:id/bookings` — cancel the calling member's booking
   * for the occurrence (T5.5). When a confirmed seat is released the head of the
   * waitlist is auto-promoted into it; the response's `promotedBookingId` carries
   * which entry was promoted (or `null` when the seat was simply freed / the
   * caller was themselves waitlisted). Returns `200 OK` with the post-cancellation
   * seat totals; the failure modes are `404` (unknown occurrence), `409
   * BOOKING_NOT_CANCELABLE` (canceled / completed occurrence), and `404
   * BOOKING_NOT_FOUND` (the caller holds no live booking). Reuses
   * {@link Permission.ClassBook} — a member managing their own booking lifecycle.
   */
  @Delete(':id/bookings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassBook)
  async cancel(@Param('id') id: string): Promise<CancelBookingResponse> {
    return this.bookings.cancel(id);
  }
}

/**
 * Validate the optional `Idempotency-Key` header. An absent (or whitespace-only)
 * header is treated as none — the booking proceeds without replay protection. A
 * present-but-malformed key (e.g. over the length ceiling) is a `400`, mirroring
 * how the other endpoints reject bad input up front.
 */
function parseIdempotencyKey(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  const result = idempotencyKeySchema.safeParse(trimmed);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => `Idempotency-Key: ${issue.message}`),
    );
  }
  return result.data;
}
