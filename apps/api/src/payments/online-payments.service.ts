import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AutomationTriggerType,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentStatus,
  StockMovementReason,
  SubscriptionStatus,
  type PaymentAttempt as AttemptRow,
  type Prisma,
} from '@fit/db';
import {
  gymSettingsStoredSchema,
  ONLINE_PAYMENTS_UNAVAILABLE_CODE,
  PAYMENT_CLIENT_OUTDATED_CODE,
  ORDER_NOT_PAYABLE_CODE,
  PAYMENT_IN_PROGRESS_CODE,
  PAYMENT_PROVIDER_UNAVAILABLE_CODE,
  type PaymentAction,
  type PaymentReturnTarget,
} from '@fit/types';
import { AutomationExecutorService } from '../automation/automation-executor.service';
import { InvoiceService, type IssuedInvoice } from '../billing/invoice.service';
import { buildMemberUrl } from '../common/console-url';
import { env, onlinePaymentsStubEnabled } from '../config/env';
import {
  FlittApiError,
  FlittClient,
  type FlittCredentials,
  type FlittOrderResult,
} from '../integrations/flitt/flitt-client';
import { verifyFlittSignature, type FlittParams } from '../integrations/flitt/flitt-signature';
import { IntegrationsService } from '../integrations/integrations.service';
import { PromoRedemptionService, type ResolvedPromo } from '../marketing/promo-redemption.service';
import { dispatchSaleAutomation } from '../orders/order-automation';
import { PrismaService } from '../prisma/prisma.service';
import { applyOrderStockMovements, type OrderStockLine } from '../products/order-stock';
import {
  AlreadySubscribedError,
  MANUAL_PAY_PROVIDER,
  applyRenewal,
  nextManualPeriod,
  startSubscription,
} from '../subscriptions/subscription-periods';
import { mintCreditPack, parseFulfilment, type OrderFulfilment } from './order-fulfilment';
import { isLiveAttempt } from './order-payment-state';

/** How long a hosted checkout accepts payment (sent to Flitt as `lifetime`). */
export const CHECKOUT_LIFETIME_SECONDS = 30 * 60;

/** Flitt's "order not found" — the status read for an order it never created. */
const FLITT_ORDER_NOT_FOUND = 1018;

/** Payment-page languages Flitt supports that a gym locale may name. */
const FLITT_LANGS = new Set(['ka', 'en', 'ru', 'uk', 'az', 'pl', 'de', 'fr', 'es', 'it', 'lv']);

/** How a purchase must be paid for at this gym right now. */
export type PurchaseMode = { mode: 'flitt'; credentials: FlittCredentials } | { mode: 'stub' };

/** Everything needed to place an online-paid order. Prices are server-resolved. */
export interface OnlinePurchaseSpec {
  gymId: string;
  memberId: string | null;
  purpose: OrderFulfilment['kind'];
  fulfilment: OrderFulfilment;
  /** Human product name for the provider's `order_desc` (gym name is prefixed). */
  description: string;
  /**
   * Where the provider sends the buyer back. `undefined` is a client that
   * predates online payments: {@link OnlinePaymentsService.begin} refuses it when
   * a checkout would have to be opened.
   */
  returnTo: PaymentReturnTarget | undefined;
  order: {
    packageId?: string | null;
    locationId?: string | null;
    total: number;
    currency: string;
    memberDiscountPercent?: number;
    memberDiscountAmount?: number;
    fulfillment?: Prisma.OrderCreateInput['fulfillment'];
    deliveryAddress?: string | null;
    items: Prisma.OrderItemCreateWithoutOrderInput[];
  };
  /** The branch the payment row is attributed to (mirrors the order's, or null). */
  paymentLocationId: string | null;
  /** A resolved promo, reserved with the order and released if it is abandoned. */
  promo: (ResolvedPromo & { discount: number }) | null;
  /** Shop lines whose stock is drawn down (reserved) with the order. */
  stockItems?: OrderStockLine[];
  /** A shop cart emptied once the buyer has a checkout to pay on. */
  cartId?: string;
}

/** What one settle call concluded — for callers that care (tests, logs). */
export type SettleOutcome =
  | { kind: 'unknown' }
  | { kind: 'final'; status: PaymentAttemptStatus }
  | { kind: 'unverifiable' }
  | { kind: 'unreachable' }
  | { kind: 'waiting'; providerStatus: string }
  | { kind: 'captured' }
  | { kind: 'failed'; status: PaymentAttemptStatus }
  | { kind: 'needs_review'; reason: string };

/**
 * Thrown inside the capture transaction when the paid-for grant can no longer be
 * honoured (the member subscribed meanwhile, the period was already paid). The
 * transaction rolls back — nothing is granted, the order stays as it was — and the
 * attempt is parked NEEDS_REVIEW for staff to reverse, like `order_not_pending`.
 */
export class FulfilmentConflictError extends Error {
  constructor(readonly reason: string) {
    super(`Fulfilment conflict: ${reason}`);
    this.name = 'FulfilmentConflictError';
  }
}

/** What a committed fulfilment still has to announce (after the transaction). */
interface FulfilmentEffects {
  invoice: IssuedInvoice | null;
  renewedSubscriptionId: string | null;
}

const NO_EFFECTS: FulfilmentEffects = { invoice: null, renewedSubscriptionId: null };

/** Subscription statuses a manual renewal payment may be applied to. */
const RENEWABLE_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

/** Callback verdict → HTTP status the webhook replies with. */
export type CallbackVerdict = 'accepted' | 'bad_request' | 'unknown_order';

/**
 * Per-gym online payments through Flitt's hosted checkout — see
 * `docs/adr/payment-provider.md`, "Per-gym Flitt flow".
 *
 * - {@link begin} places a PENDING order + PENDING payment + one attempt and
 *   opens a checkout. Nothing is granted.
 * - {@link settleAttempt} is the ONLY place an attempt (and so an order) changes
 *   state. It asks Flitt for the authoritative status with the gym's own
 *   credentials and applies it in one transaction behind a conditional claim, so
 *   the callback, the browser return, the member's sync and the sweep can all
 *   race it and the product is granted once.
 * - {@link abandonOrder} cancels an unpaid order, returning its reserved stock and
 *   promo redemption.
 *
 * Runs on the unscoped {@link PrismaService} with an explicit `gymId` on every
 * query: the webhook, the browser return and the sweep have no tenant in scope.
 */
@Injectable()
export class OnlinePaymentsService {
  private readonly logger = new Logger(OnlinePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly flitt: FlittClient,
    private readonly promos: PromoRedemptionService,
    private readonly automation: AutomationExecutorService,
    // Stateless (it works on the caller's transaction); optional so the specs that
    // build this service by hand need not pass it. Wired by `InvoiceModule`.
    @Optional() private readonly invoices: InvoiceService = new InvoiceService(),
  ) {}

  // ── Policy ──────────────────────────────────────────────────────────────

  /**
   * How a package / credit-pack purchase is paid at `gymId`: through the gym's
   * active Flitt merchant, else the instant stub where `ONLINE_PAYMENTS_STUB`
   * allows it, else `409 ONLINE_PAYMENTS_UNAVAILABLE`.
   */
  async purchaseMode(gymId: string): Promise<PurchaseMode> {
    const credentials = await this.integrations.getActiveFlittCredentials(gymId);
    if (credentials) return { mode: 'flitt', credentials };
    if (onlinePaymentsStubEnabled()) return { mode: 'stub' };
    throw onlinePaymentsUnavailable();
  }

  /**
   * The shop's variant of {@link purchaseMode}: with no Flitt the basket keeps
   * today's pay-at-pickup behaviour (never stamped paid), so there is no refusal.
   */
  async shopCredentials(gymId: string): Promise<FlittCredentials | null> {
    return this.integrations.getActiveFlittCredentials(gymId);
  }

  // ── Starting a payment ──────────────────────────────────────────────────

  /**
   * Place an online-paid order and open its first checkout. The order, its
   * PENDING payment, its first attempt, the promo reservation and (shop) the
   * stock draw-down commit together; Flitt is called after the commit so no
   * transaction is held open across the network. If Flitt cannot open the
   * checkout the order is abandoned at once — stock and promo returned, nothing
   * paid — and a `503 PAYMENT_PROVIDER_UNAVAILABLE` is raised.
   *
   * A fully discounted order (total 0) has nothing to charge: it is paid and
   * fulfilled in the same transaction and reported as `status: 'paid'`.
   */
  async begin(
    spec: OnlinePurchaseSpec,
    credentials: FlittCredentials,
  ): Promise<{ orderId: string; payment: PaymentAction }> {
    const { gymId, memberId } = spec;
    const total = spec.order.total;
    if (total > 0 && spec.order.currency !== 'GEL') {
      // Flitt merchants here settle in GEL; refusing beats charging a wrong currency.
      throw onlinePaymentsUnavailable('currency');
    }

    const free = total <= 0;
    const returnTo = spec.returnTo;
    // Before anything is written: a client that cannot follow a checkout must not
    // leave an unpaid order (and reserved stock) behind while showing "bought".
    if (!free && !returnTo) throw clientOutdated();

    const attemptId = randomUUID();
    const expiresAt = new Date(Date.now() + CHECKOUT_LIFETIME_SECONDS * 1000);

    let freeEffects: FulfilmentEffects = NO_EFFECTS;
    const orderId = await this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          gymId,
          memberId,
          packageId: spec.order.packageId ?? null,
          locationId: spec.order.locationId ?? null,
          total: Math.max(0, total),
          currency: spec.order.currency,
          memberDiscountPercent: spec.order.memberDiscountPercent ?? 0,
          memberDiscountAmount: spec.order.memberDiscountAmount ?? 0,
          ...(spec.order.fulfillment ? { fulfillment: spec.order.fulfillment } : {}),
          deliveryAddress: spec.order.deliveryAddress ?? null,
          status: free ? OrderStatus.PAID : OrderStatus.PENDING,
          items: { create: spec.order.items },
          statusEvents: {
            create: free
              ? [{ status: OrderStatus.PENDING }, { status: OrderStatus.PAID }]
              : [{ status: OrderStatus.PENDING }],
          },
        },
        select: { id: true },
      });

      if (spec.stockItems?.length) {
        await applyOrderStockMovements(tx, {
          gymId,
          orderId: order.id,
          reason: StockMovementReason.SALE,
          items: spec.stockItems,
        });
      }
      if (spec.promo) {
        // Reserved now and released if the order is abandoned: the usage cap is
        // decided BEFORE the buyer is charged, never after.
        await this.promos.consume(tx, { ...spec.promo, gymId, memberId, orderId: order.id });
      }

      const payment = await tx.payment.create({
        data: {
          gymId,
          orderId: order.id,
          amount: Math.max(0, total),
          currency: spec.order.currency,
          locationId: spec.paymentLocationId,
          status: free ? PaymentStatus.CAPTURED : PaymentStatus.PENDING,
          provider: 'flitt',
        },
        select: { id: true },
      });

      if (free) {
        // A conflict here (`FulfilmentConflictError`) rolls the whole order back
        // and reaches the caller, which maps it to its own 409.
        freeEffects = await this.fulfil(
          tx,
          { gymId, memberId, orderId: order.id },
          spec.fulfilment,
        );
      } else {
        await tx.paymentAttempt.create({
          data: {
            id: attemptId,
            gymId,
            orderId: order.id,
            paymentId: payment.id,
            provider: 'flitt',
            merchantId: credentials.merchantId,
            providerOrderId: attemptId,
            amount: total,
            currency: spec.order.currency,
            purpose: spec.purpose,
            fulfilment: spec.fulfilment,
            returnTo: returnTo!,
            expiresAt,
          },
        });
      }
      if (free && spec.cartId) {
        await tx.cart.deleteMany({ where: { id: spec.cartId, gymId } });
      }
      return order.id;
    });

    if (free) {
      this.announce(gymId, freeEffects);
      dispatchSaleAutomation(this.automation, null, { gymId, orderId, memberId, paid: true });
      return {
        orderId,
        payment: { status: 'paid', orderId, checkoutUrl: null, expiresAt: null },
      };
    }

    const checkoutUrl = await this.openCheckout(credentials, {
      attemptId,
      gymId,
      orderId,
      amount: total,
      description: spec.description,
    }).catch(async (error: unknown) => {
      await this.markAttempt(attemptId, PaymentAttemptStatus.CANCELLED, 'open_failed');
      await this.abandonOrder(gymId, orderId).catch(() => false);
      throw providerUnavailable(error);
    });

    if (spec.cartId) {
      // Only now: a buyer whose checkout could not be opened keeps their basket.
      await this.prisma.client.cart.deleteMany({ where: { id: spec.cartId, gymId } });
    }
    return {
      orderId,
      payment: {
        status: 'requires_action',
        orderId,
        checkoutUrl,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  /**
   * `POST /checkout/:orderId/payment/retry` — a fresh checkout for one of the
   * member's own still-pending online orders. An attempt that is still live is
   * handed back instead of opening a second one, so a buyer can never hold two
   * payable checkouts for one order. A failure to reach Flitt leaves the order
   * pending (the member may try again) and raises `503`.
   */
  async retry(input: {
    gymId: string;
    orderId: string;
    memberId: string;
    returnTo: PaymentReturnTarget | undefined;
  }): Promise<PaymentAction> {
    const { gymId, orderId } = input;
    const order = await this.loadOwnOrder(gymId, orderId, input.memberId);
    if (order.status === OrderStatus.PAID) {
      return { status: 'paid', orderId, checkoutUrl: null, expiresAt: null };
    }
    const returnTo = input.returnTo;
    // A client that cannot follow a checkout is never handed one (see `begin`).
    if (!returnTo) throw clientOutdated();
    if (order.status !== OrderStatus.PENDING || order.payment?.provider !== 'flitt') {
      throw notPayable();
    }
    if (order.paymentAttempts.some((a) => a.status === PaymentAttemptStatus.NEEDS_REVIEW)) {
      // Money may already have moved for this order; staff resolve it first.
      throw paymentInProgress();
    }

    // Settle whatever is still open first — it may already be paid.
    for (const attempt of order.paymentAttempts) {
      if (attempt.status !== PaymentAttemptStatus.PENDING) continue;
      if (isLiveAttempt(attempt)) {
        return {
          status: 'requires_action',
          orderId,
          checkoutUrl: attempt.checkoutUrl,
          expiresAt: attempt.expiresAt.toISOString(),
        };
      }
      await this.settleAttempt(attempt.id);
    }

    const credentials = await this.integrations.getActiveFlittCredentials(gymId);
    if (!credentials) throw onlinePaymentsUnavailable();
    const template = order.paymentAttempts[0];
    if (!template || !order.payment) throw notPayable();

    const attemptId = randomUUID();
    const expiresAt = new Date(Date.now() + CHECKOUT_LIFETIME_SECONDS * 1000);
    const created = await this.prisma.client.$transaction(async (tx) => {
      // Lock the order row: an abandon (or a parallel retry) serialises behind this.
      const locked = await tx.order.updateMany({
        where: { id: orderId, gymId, status: OrderStatus.PENDING },
        data: { updatedAt: new Date() },
      });
      if (locked.count === 0) return 'not_payable' as const;
      const open = await tx.paymentAttempt.count({
        where: {
          orderId,
          gymId,
          status: { in: [PaymentAttemptStatus.PENDING, PaymentAttemptStatus.NEEDS_REVIEW] },
        },
      });
      if (open > 0) return 'in_progress' as const;
      await tx.payment.updateMany({
        where: { id: order.payment!.id, gymId, status: { in: [PaymentStatus.FAILED] } },
        data: { status: PaymentStatus.PENDING },
      });
      await tx.paymentAttempt.create({
        data: {
          id: attemptId,
          gymId,
          orderId,
          paymentId: order.payment!.id,
          provider: 'flitt',
          merchantId: credentials.merchantId,
          providerOrderId: attemptId,
          amount: order.payment!.amount,
          currency: order.payment!.currency,
          purpose: template.purpose,
          fulfilment: template.fulfilment ?? undefined,
          returnTo,
          expiresAt,
        },
      });
      return 'created' as const;
    });
    if (created === 'not_payable') {
      const now = await this.loadOwnOrder(gymId, orderId, input.memberId);
      if (now.status === OrderStatus.PAID) {
        return { status: 'paid', orderId, checkoutUrl: null, expiresAt: null };
      }
      throw notPayable();
    }
    if (created === 'in_progress') throw paymentInProgress();

    const checkoutUrl = await this.openCheckout(credentials, {
      attemptId,
      gymId,
      orderId,
      amount: order.payment.amount,
      description: order.items[0]?.label ?? 'Order',
    }).catch(async (error: unknown) => {
      await this.markAttempt(attemptId, PaymentAttemptStatus.CANCELLED, 'open_failed');
      throw providerUnavailable(error);
    });
    return {
      status: 'requires_action',
      orderId,
      checkoutUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ── Settling ────────────────────────────────────────────────────────────

  /**
   * The one place a payment attempt changes state. Idempotent and safe to call
   * concurrently from the callback, the browser return, the member's sync and the
   * sweep: the authoritative status is re-read from Flitt (never taken from a
   * caller), checked against what the attempt was opened for, and applied behind
   * a conditional `PENDING → …` claim on the attempt row, so exactly one caller
   * wins and the product is granted once.
   */
  async settleAttempt(attemptId: string): Promise<SettleOutcome> {
    const attempt = await this.prisma.client.paymentAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt) return { kind: 'unknown' };
    if (attempt.status !== PaymentAttemptStatus.PENDING) {
      return { kind: 'final', status: attempt.status };
    }

    const credentials = await this.settlementCredentials(attempt.gymId);
    if (!credentials || credentials.merchantId !== attempt.merchantId) {
      // Disconnected, or reconnected to another merchant: this attempt cannot be
      // read with what we hold. Left pending for staff; never guessed.
      this.logger.warn(`Payment attempt ${attempt.id}: no matching merchant credentials`);
      return { kind: 'unverifiable' };
    }

    let status: FlittOrderResult;
    try {
      status = await this.flitt.getOrderStatus(credentials, attempt.providerOrderId);
    } catch (error) {
      if (error instanceof FlittApiError && error.error_code === FLITT_ORDER_NOT_FOUND) {
        // Flitt never created it (the open failed mid-flight). Once past its
        // lifetime nobody can pay it, so close it out.
        if (attempt.expiresAt.getTime() < Date.now()) {
          return this.finishUnpaid(attempt, PaymentAttemptStatus.CANCELLED, 'not_found');
        }
        return { kind: 'waiting', providerStatus: 'not_found' };
      }
      const kind = error instanceof Error ? error.name : 'error';
      this.logger.warn(`Payment attempt ${attempt.id}: status read failed (${kind})`);
      return { kind: 'unreachable' };
    }

    if (String(status.order_id) !== attempt.providerOrderId) {
      return this.needsReview(attempt, 'order_mismatch', status.order_status);
    }

    switch (status.order_status) {
      case 'approved': {
        const mismatch = paymentMismatch(attempt, status);
        if (mismatch) return this.needsReview(attempt, mismatch, status.order_status);
        return this.capture(attempt, status);
      }
      case 'declined':
        return this.finishUnpaid(attempt, PaymentAttemptStatus.FAILED, 'declined');
      case 'expired':
        return this.finishUnpaid(attempt, PaymentAttemptStatus.EXPIRED, 'expired');
      case 'reversed':
        // Approved and fully returned before we saw it: the buyer has their money.
        return this.finishUnpaid(attempt, PaymentAttemptStatus.FAILED, 'reversed');
      case 'created':
      case 'processing':
      default:
        await this.prisma.client.paymentAttempt.updateMany({
          where: { id: attempt.id, status: PaymentAttemptStatus.PENDING },
          data: { providerStatus: status.order_status, lastCheckedAt: new Date() },
        });
        return { kind: 'waiting', providerStatus: status.order_status };
    }
  }

  /** Settle every still-open attempt of one order (the member's sync button). */
  async syncOrder(gymId: string, orderId: string): Promise<void> {
    const open = await this.prisma.client.paymentAttempt.findMany({
      where: { gymId, orderId, status: PaymentAttemptStatus.PENDING },
      select: { id: true },
    });
    for (const attempt of open) {
      await this.settleAttempt(attempt.id);
    }
  }

  /**
   * The member's newest unpaid online order whose grant matches `match` (e.g. a
   * renewal of one subscription period), or `null`. An order parked for staff (a
   * NEEDS_REVIEW attempt) is never offered again. Used to hand back an existing
   * checkout instead of opening a second order for the same thing.
   */
  async findOpenOrder(
    gymId: string,
    memberId: string,
    match: (fulfilment: OrderFulfilment) => boolean,
  ): Promise<string | null> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        gymId,
        memberId,
        status: OrderStatus.PENDING,
        payment: { is: { provider: 'flitt' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        paymentAttempts: {
          select: { status: true, fulfilment: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    for (const order of orders) {
      if (order.paymentAttempts.some((a) => a.status === PaymentAttemptStatus.NEEDS_REVIEW)) {
        continue;
      }
      const fulfilment = parseFulfilment(order.paymentAttempts[0]?.fulfilment);
      if (fulfilment && match(fulfilment)) return order.id;
    }
    return null;
  }

  /**
   * Member cancel of an unpaid online order. Open attempts are settled first (a
   * payment that already went through wins); a checkout that may still be paid
   * refuses the cancel with `409 PAYMENT_IN_PROGRESS`.
   */
  async cancelOwnOrder(gymId: string, orderId: string, memberId: string): Promise<void> {
    const order = await this.loadOwnOrder(gymId, orderId, memberId);
    if (order.status !== OrderStatus.PENDING || order.payment?.provider !== 'flitt') {
      throw notPayable();
    }
    await this.syncOrder(gymId, orderId);
    if (!(await this.abandonOrder(gymId, orderId))) {
      const after = await this.loadOwnOrder(gymId, orderId, memberId);
      if (after.status === OrderStatus.PENDING) throw paymentInProgress();
      throw notPayable();
    }
  }

  /**
   * Cancel an unpaid online order: CANCELLED + status event, payment FAILED,
   * reserved shop stock returned (a `REFUND_RESTOCK` movement through the shared
   * ledger helper), and the promo redemption released. Refuses — returning
   * `false` — while any attempt is still open. Idempotent.
   */
  async abandonOrder(gymId: string, orderId: string): Promise<boolean> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        // The conditional flip takes the order row lock first, so a concurrent
        // retry (which locks the same row before adding an attempt) serialises.
        const cancelled = await tx.order.updateMany({
          where: {
            id: orderId,
            gymId,
            status: OrderStatus.PENDING,
            payment: { is: { provider: 'flitt' } },
          },
          data: { status: OrderStatus.CANCELLED },
        });
        if (cancelled.count === 0) return false;
        // An open checkout may still be paid; a NEEDS_REVIEW one may already have
        // been (approved but not grantable) — cancelling would hide money staff
        // must reverse.
        const open = await tx.paymentAttempt.count({
          where: {
            gymId,
            orderId,
            status: { in: [PaymentAttemptStatus.PENDING, PaymentAttemptStatus.NEEDS_REVIEW] },
          },
        });
        if (open > 0) throw new OpenAttemptError();

        await tx.orderStatusEvent.create({ data: { orderId, status: OrderStatus.CANCELLED } });
        await tx.payment.updateMany({
          where: { gymId, orderId, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        });
        const sold = await tx.stockMovement.count({
          where: { gymId, orderId, reason: StockMovementReason.SALE },
        });
        if (sold > 0) {
          const items = await tx.orderItem.findMany({
            where: { orderId },
            select: { productVariantId: true, qty: true },
          });
          await applyOrderStockMovements(tx, {
            gymId,
            orderId,
            reason: StockMovementReason.REFUND_RESTOCK,
            items,
          });
        }
        await this.promos.release(tx, { gymId, orderId });
        return true;
      });
    } catch (error) {
      if (error instanceof OpenAttemptError) return false;
      throw error;
    }
  }

  // ── Callback + browser return ───────────────────────────────────────────

  /**
   * `POST /webhooks/flitt`. The attempt is found by `order_id`, the signature is
   * verified with THAT gym's secret, and only then is {@link settleAttempt} run —
   * which re-reads the status from Flitt rather than trusting the callback's.
   * Anything authentic is `accepted` (Flitt retries until it gets a 200).
   */
  async handleCallback(payload: unknown): Promise<CallbackVerdict> {
    if (!isFlatParams(payload)) return 'bad_request';
    const providerOrderId = payload.order_id;
    if (typeof providerOrderId !== 'string' || providerOrderId.length === 0) return 'bad_request';

    const attempt = await this.prisma.client.paymentAttempt.findUnique({
      where: { providerOrderId },
      select: { id: true, gymId: true, merchantId: true },
    });
    if (!attempt) return 'unknown_order';

    const credentials = await this.settlementCredentials(attempt.gymId);
    if (
      !credentials ||
      !verifyFlittSignature(credentials.secretKey, payload) ||
      String(payload.merchant_id ?? '') !== attempt.merchantId
    ) {
      this.logger.warn(`Rejected Flitt callback for attempt ${attempt.id}`);
      return 'bad_request';
    }

    try {
      await this.settleAttempt(attempt.id);
    } catch (error) {
      // Authentic: still a 200. The sweep settles it on its next tick.
      const kind = error instanceof Error ? error.name : 'error';
      this.logger.error(`Settling attempt ${attempt.id} after callback failed (${kind})`);
    }
    return 'accepted';
  }

  /**
   * The browser's way back from the hosted page. Settles (best effort — nothing
   * in the browser's request is read) and returns where to send the buyer, or
   * `null` for an unknown attempt.
   */
  async handleReturn(attemptId: string): Promise<string | null> {
    const attempt = await this.prisma.client.paymentAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, orderId: true, returnTo: true, gym: { select: { slug: true } } },
    });
    if (!attempt) return null;
    try {
      await this.settleAttempt(attempt.id);
    } catch {
      // The result page polls `/payment/sync`; the redirect must not fail.
    }
    return buildResultUrl(attempt.returnTo, attempt.orderId, attempt.gym.slug);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async capture(attempt: AttemptRow, status: FlittOrderResult): Promise<SettleOutcome> {
    const now = new Date();
    const providerRef =
      status.payment_id !== undefined ? String(status.payment_id) : attempt.providerPaymentId;
    const result = await this.prisma.client
      .$transaction(async (tx) => {
        // The claim: only one settler moves the attempt out of PENDING. A racing
        // transaction blocks on the row lock, re-evaluates the predicate after this
        // one commits, and matches nothing (docs/adr/atomic-counters.md).
        const claimed = await tx.paymentAttempt.updateMany({
          where: { id: attempt.id, status: PaymentAttemptStatus.PENDING },
          data: {
            status: PaymentAttemptStatus.CAPTURED,
            providerStatus: 'approved',
            providerPaymentId: providerRef,
            settledAt: now,
            lastCheckedAt: now,
          },
        });
        if (claimed.count === 0) return { kind: 'lost' as const };

        const paid = await tx.order.updateMany({
          where: { id: attempt.orderId, gymId: attempt.gymId, status: OrderStatus.PENDING },
          data: { status: OrderStatus.PAID },
        });
        if (paid.count === 0) {
          // Abandoned, or paid by another attempt: money arrived that this order
          // cannot take. Grant nothing; staff reverse it.
          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: { status: PaymentAttemptStatus.NEEDS_REVIEW, failureCode: 'order_not_pending' },
          });
          return { kind: 'review' as const };
        }
        await tx.orderStatusEvent.create({
          data: { orderId: attempt.orderId, status: OrderStatus.PAID },
        });
        await tx.payment.update({
          where: { id: attempt.paymentId },
          data: { status: PaymentStatus.CAPTURED, providerRef, provider: 'flitt' },
        });
        const order = await tx.order.findFirst({
          where: { id: attempt.orderId, gymId: attempt.gymId },
          select: { memberId: true },
        });
        const fulfilment = parseFulfilment(attempt.fulfilment);
        const effects = fulfilment
          ? await this.fulfil(
              tx,
              { gymId: attempt.gymId, memberId: order?.memberId ?? null, orderId: attempt.orderId },
              fulfilment,
              now,
            )
          : NO_EFFECTS;
        return { kind: 'captured' as const, memberId: order?.memberId ?? null, effects };
      })
      .catch((error: unknown) => {
        // The grant could not be honoured: everything above rolled back (the
        // attempt is PENDING again, the order unpaid) and the attempt is parked
        // for staff below. Never a retry loop: NEEDS_REVIEW is final.
        if (error instanceof FulfilmentConflictError) {
          return { kind: 'conflict' as const, reason: error.reason };
        }
        throw error;
      });

    if (result.kind === 'conflict') {
      return this.needsReview(attempt, result.reason, 'approved');
    }

    if (result.kind === 'lost') {
      const current = await this.prisma.client.paymentAttempt.findUnique({
        where: { id: attempt.id },
        select: { status: true },
      });
      return { kind: 'final', status: current?.status ?? PaymentAttemptStatus.CAPTURED };
    }
    if (result.kind === 'review') {
      this.logger.error(
        `Payment attempt ${attempt.id} approved for an order that is no longer pending — needs review`,
      );
      return { kind: 'needs_review', reason: 'order_not_pending' };
    }
    this.logger.log(`Payment attempt ${attempt.id} captured`);
    this.announce(attempt.gymId, result.effects);
    dispatchSaleAutomation(this.automation, null, {
      gymId: attempt.gymId,
      orderId: attempt.orderId,
      memberId: result.memberId,
      paid: true,
    });
    return { kind: 'captured' };
  }

  private async finishUnpaid(
    attempt: AttemptRow,
    status: PaymentAttemptStatus,
    code: string,
  ): Promise<SettleOutcome> {
    const now = new Date();
    await this.prisma.client.$transaction(async (tx) => {
      const claimed = await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: PaymentAttemptStatus.PENDING },
        data: {
          status,
          failureCode: code,
          providerStatus: code,
          settledAt: now,
          lastCheckedAt: now,
        },
      });
      if (claimed.count === 0) return;
      // The order stays PENDING so the member can retry; the sweep abandons it later.
      await tx.payment.updateMany({
        where: { id: attempt.paymentId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
    });
    return { kind: 'failed', status };
  }

  private async needsReview(
    attempt: AttemptRow,
    reason: string,
    providerStatus: string,
  ): Promise<SettleOutcome> {
    await this.prisma.client.paymentAttempt.updateMany({
      where: { id: attempt.id, status: PaymentAttemptStatus.PENDING },
      data: {
        status: PaymentAttemptStatus.NEEDS_REVIEW,
        failureCode: reason,
        providerStatus,
        lastCheckedAt: new Date(),
      },
    });
    this.logger.error(`Payment attempt ${attempt.id} needs review: ${reason}`);
    return { kind: 'needs_review', reason };
  }

  private async markAttempt(
    attemptId: string,
    status: PaymentAttemptStatus,
    code: string,
  ): Promise<void> {
    await this.prisma.client.paymentAttempt
      .updateMany({
        where: { id: attemptId, status: PaymentAttemptStatus.PENDING },
        data: { status, failureCode: code, settledAt: new Date() },
      })
      .catch(() => undefined);
  }

  /**
   * Grant what an order bought, inside the capture (or free-order) transaction.
   * Throws {@link FulfilmentConflictError} when a subscription grant can no longer
   * be honoured, which rolls the whole transaction back.
   */
  private async fulfil(
    tx: Prisma.TransactionClient,
    target: { gymId: string; memberId: string | null; orderId: string },
    fulfilment: OrderFulfilment,
    now?: Date,
  ): Promise<FulfilmentEffects> {
    switch (fulfilment.kind) {
      case 'package':
      case 'shop':
        return NO_EFFECTS;
      case 'credit_pack':
        if (!target.memberId) {
          this.logger.error(`Order ${target.orderId}: credit pack paid with no member to mint for`);
          return NO_EFFECTS;
        }
        await mintCreditPack(tx, {
          gymId: target.gymId,
          memberId: target.memberId,
          orderId: target.orderId,
          planId: fulfilment.planId,
          name: fulfilment.name,
          credits: fulfilment.credits,
          validityDays: fulfilment.validityDays,
          now,
        });
        return NO_EFFECTS;
      case 'subscription_start':
        return this.fulfilSubscriptionStart(tx, target, fulfilment, now ?? new Date());
      case 'subscription_renewal':
        return this.fulfilSubscriptionRenewal(tx, target, fulfilment);
    }
  }

  /**
   * The paid first period: the same `startSubscription` the stub enrolment runs,
   * on the terms snapshotted when the order was opened, starting at the moment
   * the payment was confirmed. The live-slot check runs again here — a member who
   * subscribed while paying gets nothing granted (NEEDS_REVIEW).
   */
  private async fulfilSubscriptionStart(
    tx: Prisma.TransactionClient,
    target: { gymId: string; memberId: string | null; orderId: string },
    fulfilment: Extract<OrderFulfilment, { kind: 'subscription_start' }>,
    now: Date,
  ): Promise<FulfilmentEffects> {
    if (!target.memberId) throw new FulfilmentConflictError('no_member');
    // A plan deleted while the buyer paid: the paid terms still apply, plan-less.
    const plan = await tx.subscriptionPlan.findFirst({
      where: { id: fulfilment.planId, gymId: target.gymId },
      select: { id: true },
    });
    try {
      const started = await startSubscription(tx, this.invoices, {
        gymId: target.gymId,
        memberId: target.memberId,
        planId: plan?.id ?? null,
        planName: fulfilment.planName,
        priceAmount: fulfilment.priceAmount,
        currency: fulfilment.currency,
        interval: fulfilment.interval,
        intervalCount: fulfilment.intervalCount ?? 1,
        oneTime: fulfilment.oneTime ?? false,
        trialDays: 0,
        provider: MANUAL_PAY_PROVIDER,
        orderId: target.orderId,
        now,
      });
      return { invoice: started.invoice, renewedSubscriptionId: null };
    } catch (error) {
      if (error instanceof AlreadySubscribedError) {
        throw new FulfilmentConflictError('already_subscribed');
      }
      throw error;
    }
  }

  /**
   * One manually paid period: advanced exactly as a successful renewal charge
   * advances it (`applyRenewal`), guarded on the period end the order was opened
   * for — so a second paid order for the same period, or a subscription that
   * lapsed / froze meanwhile, advances nothing (NEEDS_REVIEW).
   */
  private async fulfilSubscriptionRenewal(
    tx: Prisma.TransactionClient,
    target: { gymId: string; memberId: string | null; orderId: string },
    fulfilment: Extract<OrderFulfilment, { kind: 'subscription_renewal' }>,
  ): Promise<FulfilmentEffects> {
    const sub = await tx.subscription.findFirst({
      where: { id: fulfilment.subscriptionId, gymId: target.gymId },
      select: {
        id: true,
        gymId: true,
        memberId: true,
        status: true,
        currentPeriodEnd: true,
        priceAmount: true,
        currency: true,
        interval: true,
        intervalCount: true,
        plan: { select: { name: true } },
      },
    });
    if (!sub || sub.memberId !== target.memberId) {
      throw new FulfilmentConflictError('subscription_missing');
    }
    if (sub.currentPeriodEnd.toISOString() !== new Date(fulfilment.periodEnd).toISOString()) {
      throw new FulfilmentConflictError('period_already_paid');
    }
    if (!RENEWABLE_STATUSES.includes(sub.status)) {
      throw new FulfilmentConflictError('subscription_not_payable');
    }
    const { nextPeriodStart, nextPeriodEnd } = nextManualPeriod(
      sub.currentPeriodEnd,
      sub.interval,
      sub.intervalCount,
    );
    const invoice = await applyRenewal(tx, this.invoices, {
      sub: {
        id: sub.id,
        gymId: sub.gymId,
        memberId: sub.memberId,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        priceAmount: sub.priceAmount,
        currency: sub.currency,
        interval: sub.interval,
        intervalCount: sub.intervalCount,
        planName: sub.plan?.name ?? null,
      },
      nextPeriodStart,
      nextPeriodEnd,
      provider: MANUAL_PAY_PROVIDER,
      orderId: target.orderId,
    });
    // Another writer advanced or moved it between the read and the update.
    if (!invoice) throw new FulfilmentConflictError('period_already_paid');
    return { invoice, renewedSubscriptionId: sub.id };
  }

  /** Post-commit announcements of a fulfilment (best-effort, never awaited). */
  private announce(gymId: string, effects: FulfilmentEffects): void {
    if (effects.invoice) this.invoices.announcePaid({ gymId }, effects.invoice);
    if (effects.renewedSubscriptionId) {
      void this.automation.dispatchForGym(gymId, AutomationTriggerType.membership_renewed, {
        entityId: effects.renewedSubscriptionId,
        entityType: 'subscription',
      });
    }
  }

  private async openCheckout(
    credentials: FlittCredentials,
    input: {
      attemptId: string;
      gymId: string;
      orderId: string;
      amount: number;
      description: string;
    },
  ): Promise<string> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: input.gymId },
      select: { name: true, settings: true },
    });
    const language = gymLanguage(gym?.settings);
    const base = env.API_PUBLIC_URL.replace(/\/+$/, '');
    const result = await this.flitt.createCheckout(credentials, {
      orderId: input.attemptId,
      amount: input.amount,
      currency: 'GEL',
      description: `${gym?.name ?? 'Gym'} — ${input.description}`.slice(0, 1000),
      responseUrl: `${base}/payments/flitt/return/${encodeURIComponent(input.attemptId)}`,
      serverCallbackUrl: `${base}/webhooks/flitt`,
      lang: language,
      lifetimeSeconds: CHECKOUT_LIFETIME_SECONDS,
    });
    await this.prisma.client.paymentAttempt.updateMany({
      where: { id: input.attemptId, gymId: input.gymId },
      data: { checkoutUrl: result.checkout_url, providerPaymentId: String(result.payment_id) },
    });
    return result.checkout_url;
  }

  private async settlementCredentials(gymId: string): Promise<FlittCredentials | null> {
    try {
      return await this.integrations.getFlittCredentialsForSettlement(gymId);
    } catch {
      // No encryption key configured / undecryptable: cannot verify anything.
      return null;
    }
  }

  private async loadOwnOrder(gymId: string, orderId: string, memberId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId, gymId, memberId },
      select: {
        id: true,
        status: true,
        items: { select: { label: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        payment: {
          select: { id: true, provider: true, status: true, amount: true, currency: true },
        },
        paymentAttempts: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    return order;
  }
}

/**
 * {@link OnlinePaymentsService.purchaseMode} for a caller whose payments
 * dependency is optional (hand-built in unit specs): without the service the
 * gym has no provider, so only the stub flag decides.
 */
export async function resolvePurchaseMode(
  payments: OnlinePaymentsService | undefined,
  gymId: string,
): Promise<PurchaseMode> {
  if (payments) return payments.purchaseMode(gymId);
  if (onlinePaymentsStubEnabled()) return { mode: 'stub' };
  throw onlinePaymentsUnavailable();
}

/** Internal signal that rolls an abandon back while an attempt is still open. */
class OpenAttemptError extends Error {}

/** The member-facing result location the browser is sent to after paying. */
export function buildResultUrl(returnTo: string, orderId: string, gymSlug: string | null): string {
  const query = `orderId=${encodeURIComponent(orderId)}`;
  if (returnTo === 'app') return `${env.MOBILE_APP_SCHEME}://checkout/result?${query}`;
  return buildMemberUrl(`checkout/result?${query}`, gymSlug);
}

/** Whether the provider's report matches what the attempt was opened for. */
export function paymentMismatch(
  attempt: { amount: number; currency: string; merchantId: string },
  status: FlittOrderResult & { merchant_id?: string | number },
): string | null {
  if (status.merchant_id !== undefined && String(status.merchant_id) !== attempt.merchantId) {
    return 'merchant_mismatch';
  }
  if (status.amount === undefined || Number(status.amount) !== attempt.amount) {
    return 'amount_mismatch';
  }
  if (status.currency === undefined || String(status.currency) !== attempt.currency) {
    return 'currency_mismatch';
  }
  return null;
}

function gymLanguage(settings: unknown): string {
  const parsed = gymSettingsStoredSchema.safeParse(settings ?? {});
  const language = parsed.success ? String(parsed.data.locale.language) : 'ka';
  return FLITT_LANGS.has(language) ? language : 'ka';
}

function isFlatParams(value: unknown): value is FlittParams {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(
      (entry) => entry === null || ['string', 'number', 'boolean'].includes(typeof entry),
    )
  );
}

function onlinePaymentsUnavailable(reason?: string): ConflictException {
  return new ConflictException({
    code: ONLINE_PAYMENTS_UNAVAILABLE_CODE,
    message: 'This gym does not accept online payments right now',
    ...(reason ? { details: [reason] } : {}),
  });
}

function clientOutdated(): ConflictException {
  return new ConflictException({
    code: PAYMENT_CLIENT_OUTDATED_CODE,
    message: 'Update the app to pay online',
  });
}

function notPayable(): ConflictException {
  return new ConflictException({
    code: ORDER_NOT_PAYABLE_CODE,
    message: 'This order is not awaiting payment',
  });
}

function paymentInProgress(): ConflictException {
  return new ConflictException({
    code: PAYMENT_IN_PROGRESS_CODE,
    message: 'A payment for this order is still in progress',
  });
}

function providerUnavailable(error: unknown): ServiceUnavailableException {
  const reason = error instanceof FlittApiError ? 'provider_error' : 'unreachable';
  return new ServiceUnavailableException({
    code: PAYMENT_PROVIDER_UNAVAILABLE_CODE,
    message: 'The payment provider could not start the payment; nothing was charged',
    details: [reason],
  });
}
