import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createCheckoutSchema,
  roleHasPermission,
  type CheckoutProductType,
  type CreateCheckoutResponse,
  type GetOrderResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CheckoutService } from './checkout.service';

/**
 * The self-service capability each catalogue product is bought with — the *same*
 * one the product's own dedicated route requires, so buying through the wizard
 * and buying through the direct route are gated identically:
 *
 * - `credit_pack` → `POST /credit-packs/:id/purchase` requires `CreditPackManage`.
 * - `subscription` → `POST /subscriptions` requires `SubscriptionManage` (the
 *   member/staff split this pins is asserted in
 *   `subscription-enrollment.authz.integration.spec.ts`).
 * - `package` → no dedicated route; it settles onto an order exactly as a credit
 *   pack does (see {@link CheckoutService}), so it rides the same capability.
 *
 * Checked per request rather than declared on the handler because
 * `@RequirePermissions` is AND-only: listing both there made a credit-pack
 * purchase demand `SubscriptionManage` and an enrolment demand
 * `CreditPackManage` — two unrelated capabilities welded together, so a role
 * holding exactly the one it needs was refused.
 */
const CHECKOUT_PERMISSION: Record<CheckoutProductType, Permission> = {
  credit_pack: Permission.CreditPackManage,
  subscription: Permission.SubscriptionManage,
  package: Permission.CreditPackManage,
};

/**
 * Member checkout (`/checkout`) — the join wizard's final step and its
 * confirmation read.
 *
 * A member buying *for themselves*, so it sits behind {@link TenantGuard} + the
 * global {@link PermissionsGuard} exactly like the credit-pack and subscription
 * self-service routes it delegates to, and requires the same self-service
 * capabilities the `MEMBER` role already holds. Nothing here is public: by this
 * point in the wizard the buyer has an account and a session (step 3 signs them
 * up), which is what lets the service take the gym, the member and the price off
 * the session and the catalogue rather than off the wire.
 *
 * Distinct from the staff-only {@link import('../orders/orders.controller').OrdersController}
 * (`/orders`), which is the console's order-management surface and requires
 * billing permissions no member has. **Front-desk staff are meant to be outside
 * this controller**: a MANAGER or RECEPTIONIST selling to a walk-in rings the
 * sale up on `POST /orders/pos-sale` or enrols them via
 * `POST /admin/subscriptions/enroll` (`BillingManage`) — routes that take the
 * buyer from the body. Nothing here can sell to anybody but the caller, so
 * admitting a staff role would buy the *staff member* a membership.
 *
 * The route gate is therefore only `ProfileManage` — the self-service capability
 * every gym-scoped role holds, the same one the `/me` routes use — with the
 * capability that actually authorizes the purchase resolved per product from
 * {@link CHECKOUT_PERMISSION}. The two together keep the access set exactly as
 * intended (a MANAGER holds neither purchase capability and is refused whichever
 * product they ask for) without welding the two capabilities into an AND.
 */
@Controller('checkout')
@UseGuards(TenantGuard, PermissionsGuard)
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * `POST /checkout` — buy the chosen catalogue product. Returns `201` with the
   * `productType` plus whichever record the purchase settled onto (`orderId` for
   * a package / credit pack, `subscriptionId` for a subscription).
   *
   * Authorized on the capability the chosen product needs
   * ({@link CHECKOUT_PERMISSION}) — resolved after the body is validated, so an
   * unparseable `productType` is the `400` it has always been rather than a
   * misleading `403`.
   *
   * Failure modes the wizard branches on: `422 PRODUCT_UNAVAILABLE` (missing,
   * cross-tenant, or not on sale), `409 ALREADY_SUBSCRIBED` (from subscription
   * enrolment), and `403` when the session has no live membership in this gym.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ProfileManage)
  async create(@Body() body: unknown): Promise<CreateCheckoutResponse> {
    const input = parse(createCheckoutSchema, body);
    this.requirePurchaseCapability(input.productType);
    return this.checkout.checkout(input);
  }

  /**
   * Refuse the request unless the caller holds the self-service capability that
   * buying `productType` requires. Mirrors {@link PermissionsGuard}'s rejection
   * body verbatim so a client cannot tell a route-level refusal from this one.
   *
   * **Deliberately still the static matrix, and it cannot disagree with the guard.**
   * Both capabilities this checks — `CreditPackManage` and `SubscriptionManage` —
   * are self-service, so they are outside the editable vocabulary a gym can change:
   * `resolveRolePermissions` puts them back from `ROLE_PERMISSIONS` for every role,
   * whatever the gym stored. `roleHasPermission` therefore returns the same answer
   * the resolver would, without making a synchronous controller await a database
   * read. If a future capability here becomes editable, this must move to the
   * resolved set.
   */
  private requirePurchaseCapability(productType: CheckoutProductType): void {
    const role = this.tenant.role;
    if (role === undefined || !roleHasPermission(role, CHECKOUT_PERMISSION[productType])) {
      throw new ForbiddenException({
        message: 'You do not have permission to perform this action',
        code: 'INSUFFICIENT_PERMISSION',
      });
    }
  }

  /**
   * `GET /checkout/:orderId` — the confirmation summary for one of the caller's
   * own orders. An id belonging to another member or gym is a `404`, never a
   * disclosure that it exists.
   *
   * Gated on `ProfileManage` alone: the row is already scoped to the caller's own
   * membership by {@link CheckoutService.readOrder}, so the capability adds
   * nothing a purchase capability would. Demanding `CreditPackManage` *and*
   * `SubscriptionManage` here meant staff who are also members of the gym they
   * work at could not open the confirmation for a purchase they had just made.
   */
  @Get(':orderId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async read(@Param('orderId') orderId: string): Promise<GetOrderResponse> {
    return this.checkout.readOrder(orderId);
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers so validation errors read
 * identically across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
