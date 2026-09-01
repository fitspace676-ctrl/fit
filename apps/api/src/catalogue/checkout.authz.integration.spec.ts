import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Role } from '@fit/db';
import { Permission } from '@fit/types';
import type { NextFunction, Request, Response } from 'express';
import { loggerConfig } from '../common/logging';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import {
  clearRequestAccessResolver,
  registerRequestAccessResolver,
} from '../common/rbac/request-access';
import { defaultsRequestAccessResolver } from '../test/request-access-stub';
import { TenantContext, tenantStorage, type TenantState } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

/**
 * Pins **who can reach member checkout** (`POST /checkout`,
 * `GET /checkout/:orderId`) over real HTTP.
 *
 * `/checkout` is the join wizard's purchase and the member portal's change-plan
 * action: everything identifying the buyer is taken from the session, so it can
 * only ever sell to the caller. Front-desk staff selling to a walk-in use
 * `POST /orders/pos-sale` or `POST /admin/subscriptions/enroll` instead — which
 * is why a MANAGER / RECEPTIONIST / TRAINER is refused here by design, not by
 * accident.
 *
 * The regression this guards: the two routes used to declare
 * `@RequirePermissions(CreditPackManage, SubscriptionManage)`, and
 * `PermissionsGuard` ANDs its list — so buying a credit pack demanded the
 * *subscription* capability and enrolling demanded the *credit-pack* one. Two
 * unrelated self-service capabilities were welded together, contradicting the
 * per-product routes those purchases delegate to (`POST /credit-packs/:id/purchase`
 * → `CreditPackManage`; `POST /subscriptions` → `SubscriptionManage`, pinned in
 * `subscription-enrollment.authz.integration.spec.ts`).
 *
 * A test middleware stands in for the real `TenantMiddleware`, opening the same
 * {@link tenantStorage} ALS store from `x-test-*` headers so the guards resolve a
 * caller exactly as in production. The checkout service is a stub: this asserts
 * the gate, not the purchase path (covered by the service specs).
 */
describe('Member checkout authorization (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const checkoutStub = {
    checkout: () =>
      Promise.resolve({ productType: 'credit_pack', orderId: 'order-1', subscriptionId: null }),
    readOrder: () =>
      Promise.resolve({
        order: { id: 'order-1', status: 'paid', total: 1000, currency: 'GEL', items: [] },
      }),
  };

  beforeAll(async () => {
    // `PermissionsGuard` resolves each request's grants through the process-wide
    // resolver and DENIES when there is none — an unresolvable permission set is a
    // 403, never a fall-back to the static matrix. This spec has no database, so it
    // registers the built-in defaults: exactly what a gym that has configured
    // nothing resolves to, which is the behaviour these routes are pinned against.
    registerRequestAccessResolver(defaultsRequestAccessResolver());

    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot(loggerConfig())],
      controllers: [CheckoutController],
      providers: [
        TenantContext,
        TenantGuard,
        PermissionsGuard,
        { provide: CheckoutService, useValue: checkoutStub },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const roleHeader = req.headers['x-test-role'];
      if (typeof roleHeader !== 'string') {
        next();
        return;
      }
      const state: TenantState = {
        userId: 'user-1',
        gymId: 'gym-1',
        role: roleHeader as Role,
        allowCrossTenant: false,
      };
      tenantStorage.run(state, () => next());
    });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    // The holder is process-wide; leaving it set would change the next spec file.
    clearRequestAccessResolver();
  });

  const buy = (role: Role, productType: string) =>
    fetch(`${baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': role },
      body: JSON.stringify({ productType, productId: 'prod-1' }),
    });

  const read = (role: Role) =>
    fetch(`${baseUrl}/checkout/order-1`, { headers: { 'x-test-role': role } });

  /** Every product the wizard can sell — each must be reachable by a member. */
  const PRODUCT_TYPES = ['credit_pack', 'subscription', 'package'] as const;

  describe('POST /checkout — the roles that may buy', () => {
    it.each(PRODUCT_TYPES)('lets a MEMBER buy a %s (201)', async (productType) => {
      const res = await buy(Role.MEMBER, productType);
      expect(res.status).toBe(201);
    });

    it.each(PRODUCT_TYPES)('lets an OWNER buy a %s (201)', async (productType) => {
      // OWNER holds both self-service capabilities, so an owner who is also a
      // member of their own gym can buy through the wizard. Unchanged behaviour,
      // pinned so decoupling the two capabilities cannot silently drop it.
      const res = await buy(Role.OWNER, productType);
      expect(res.status).toBe(201);
    });

    // Front-desk and floor staff sell through the POS / staff-enrolment routes,
    // which take the buyer from the body. This endpoint can only sell to the
    // caller, so admitting them would buy the *staff member* a membership.
    it.each(
      (['MANAGER', 'RECEPTIONIST', 'TRAINER'] as const).flatMap((role) =>
        PRODUCT_TYPES.map((productType) => [role, productType] as const),
      ),
    )('forbids a %s buying a %s (403)', async (role, productType) => {
      const res = await buy(Role[role], productType);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('INSUFFICIENT_PERMISSION');
    });

    it('rejects a malformed body with 400, not 403', async () => {
      // The product's capability can only be resolved once the body parses, so
      // validation must still run first for a caller who holds it.
      const res = await fetch(`${baseUrl}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-role': Role.MEMBER },
        body: JSON.stringify({ productType: 'not-a-product', productId: 'prod-1' }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('does not AND the two self-service purchase capabilities on the route', () => {
    // `PermissionsGuard` requires *every* listed permission, so listing both
    // `CreditPackManage` and `SubscriptionManage` made each purchase demand the
    // other's capability. No role holds exactly one today, which is why this is
    // asserted structurally: the coupling is a latent lockout, invisible until a
    // role (or a per-gym grant) holds one without the other.
    for (const method of ['create', 'read'] as const) {
      // Read through the descriptor rather than the prototype property so the
      // handler is never treated as an unbound method reference.
      const handler: unknown = Object.getOwnPropertyDescriptor(
        CheckoutController.prototype,
        method,
      )?.value;
      const declared = (Reflect.getMetadata(PERMISSIONS_KEY, handler as object) ??
        []) as Permission[];
      const purchaseCapabilities = declared.filter((permission) =>
        [Permission.CreditPackManage, Permission.SubscriptionManage].includes(permission),
      );
      expect(purchaseCapabilities.length).toBeLessThan(2);
    }
  });

  describe('GET /checkout/:orderId — one’s own confirmation', () => {
    it('lets a MEMBER read their own order (200)', async () => {
      expect((await read(Role.MEMBER)).status).toBe(200);
    });

    it('lets a staff member who is also a member read their own order (200)', async () => {
      // The row is scoped to the caller's own membership by
      // `CheckoutService.readOrder`, so the route needs no purchase capability —
      // and demanding one meant a receptionist who bought a membership at the gym
      // they work at could not open their own confirmation.
      expect((await read(Role.RECEPTIONIST)).status).toBe(200);
    });
  });
});
