import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Role } from '@fit/db';
import type { NextFunction, Request, Response } from 'express';
import { loggerConfig } from '../common/logging';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantContext, tenantStorage, type TenantState } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminSubscriptionEnrollmentController } from './admin-subscription-enrollment.controller';
import { SubscriptionEnrollmentService } from './subscription-enrollment.service';
import { SubscriptionFreezeService } from './subscription-freeze.service';
import { SubscriptionsController } from './subscriptions.controller';

/**
 * Proves the enrolment authorization contract over real HTTP (T5.3): member
 * self-checkout (`POST /subscriptions`) requires `SubscriptionManage`, and staff
 * enrolment (`POST /admin/subscriptions/enroll`) requires `BillingManage` — so a
 * role holding one capability cannot reach the other's route.
 *
 * A test middleware stands in for the real `TenantMiddleware`, opening the same
 * {@link tenantStorage} ALS store from `x-test-*` headers so the guards resolve a
 * caller exactly as in production. The enrolment service is a stub: this asserts
 * the gate, not the data path (covered by the unit spec).
 */
describe('Subscription enrolment authorization (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const enrolled = {
    subscription: {
      id: 'sub-new',
      status: 'ACTIVE' as const,
      planId: 'plan-1',
      planName: 'Premium',
      priceAmount: 12000,
      currency: 'GEL',
      interval: 'MONTH' as const,
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      createdAt: '2026-06-01T00:00:00.000Z',
    },
  };

  const enrollmentStub = {
    enrollSelf: () => Promise.resolve(enrolled),
    enrollMember: () => Promise.resolve(enrolled),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot(loggerConfig())],
      controllers: [SubscriptionsController, AdminSubscriptionEnrollmentController],
      providers: [
        TenantContext,
        TenantGuard,
        PermissionsGuard,
        { provide: SubscriptionEnrollmentService, useValue: enrollmentStub },
        // SubscriptionsController also depends on the freeze service; not exercised here.
        { provide: SubscriptionFreezeService, useValue: {} },
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
        userId: (req.headers['x-test-user'] as string | undefined) ?? 'user-1',
        gymId: (req.headers['x-test-gym'] as string | undefined) ?? 'gym-1',
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
  });

  const post = (path: string, role: Role, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': role, 'x-test-user': 'u-1' },
      body: JSON.stringify(body),
    });

  describe('POST /subscriptions (member self-checkout)', () => {
    it('lets a MEMBER enrol themselves (201)', async () => {
      const res = await post('/subscriptions', Role.MEMBER, { planId: 'plan-1' });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { subscription: { id: string } };
      expect(body.subscription.id).toBe('sub-new');
    });

    it('forbids a RECEPTIONIST (lacks SubscriptionManage) — 403', async () => {
      const res = await post('/subscriptions', Role.RECEPTIONIST, { planId: 'plan-1' });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('INSUFFICIENT_PERMISSION');
    });

    it('rejects a missing planId with 400', async () => {
      const res = await post('/subscriptions', Role.MEMBER, {});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/subscriptions/enroll (staff enrolment)', () => {
    it('lets a MANAGER enrol a member (201)', async () => {
      const res = await post('/admin/subscriptions/enroll', Role.MANAGER, {
        memberId: 'member-1',
        planId: 'plan-1',
      });
      expect(res.status).toBe(201);
    });

    it('forbids a MEMBER (lacks BillingManage) — 403', async () => {
      const res = await post('/admin/subscriptions/enroll', Role.MEMBER, {
        memberId: 'member-1',
        planId: 'plan-1',
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('INSUFFICIENT_PERMISSION');
    });

    it('rejects a missing memberId with 400', async () => {
      const res = await post('/admin/subscriptions/enroll', Role.MANAGER, { planId: 'plan-1' });
      expect(res.status).toBe(400);
    });
  });
});
