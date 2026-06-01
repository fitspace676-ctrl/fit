import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Role } from '@fit/db';
import type { NextFunction, Request, Response } from 'express';
import { loggerConfig } from '../common/logging';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { TenantContext, tenantStorage, type TenantState } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';

/**
 * Proves the cross-tenant authorization contract over real HTTP: only a
 * `SUPER_ADMIN` may reach any `/admin/gyms` route; everyone else gets `403`.
 *
 * A test middleware stands in for the real `TenantMiddleware`, opening the same
 * {@link tenantStorage} ALS store from `x-test-role` / `x-test-user` headers so
 * the {@link TenantGuard} resolves a caller exactly as it does in production —
 * without minting JWTs. The service is a stub: this asserts the gate, not the
 * data path (covered by the unit specs).
 */
describe('SuperAdmin authorization (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const serviceStub = {
    listGyms: () =>
      Promise.resolve({
        gyms: [
          {
            id: 'gym-1',
            name: 'Downtown',
            subdomainSlug: 'downtown',
            status: 'ACTIVE',
            memberCount: 3,
            mrr: 0,
          },
        ],
      }),
    setGymStatus: (_actor: string, id: string) => Promise.resolve({ id, status: 'SUSPENDED' }),
    impersonate: () => Promise.resolve({ accessToken: 'scoped.jwt' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot(loggerConfig())],
      controllers: [SuperAdminController],
      providers: [
        TenantContext,
        TenantGuard,
        { provide: SuperAdminService, useValue: serviceStub },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    // Stand-in for TenantMiddleware: establish tenant state from test headers.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const roleHeader = req.headers['x-test-role'];
      if (typeof roleHeader !== 'string') {
        next();
        return;
      }
      const state: TenantState = {
        userId: (req.headers['x-test-user'] as string | undefined) ?? 'user-1',
        gymId: (req.headers['x-test-gym'] as string | undefined) ?? null,
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

  it('lets a SUPER_ADMIN list every gym', async () => {
    const res = await fetch(`${baseUrl}/admin/gyms`, {
      headers: { 'x-test-role': Role.SUPER_ADMIN, 'x-test-user': 'admin-1' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gyms: unknown[] };
    expect(body.gyms).toHaveLength(1);
  });

  it('forbids a non-SUPER_ADMIN from listing gyms (403)', async () => {
    const res = await fetch(`${baseUrl}/admin/gyms`, {
      headers: { 'x-test-role': Role.OWNER, 'x-test-user': 'owner-1', 'x-test-gym': 'gym-1' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('CROSS_TENANT_FORBIDDEN');
  });

  it('forbids a plain MEMBER from suspending a gym (403)', async () => {
    const res = await fetch(`${baseUrl}/admin/gyms/gym-1/status`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-role': Role.MEMBER,
        'x-test-user': 'm-1',
      },
      body: JSON.stringify({ status: 'SUSPENDED' }),
    });
    expect(res.status).toBe(403);
  });

  it('forbids a non-SUPER_ADMIN from impersonating (403)', async () => {
    const res = await fetch(`${baseUrl}/admin/gyms/gym-1/impersonate`, {
      method: 'POST',
      headers: { 'x-test-role': Role.MANAGER, 'x-test-user': 'mgr-1' },
    });
    expect(res.status).toBe(403);
  });

  it('lets a SUPER_ADMIN suspend a gym', async () => {
    const res = await fetch(`${baseUrl}/admin/gyms/gym-1/status`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-role': Role.SUPER_ADMIN,
        'x-test-user': 'admin-1',
      },
      body: JSON.stringify({ status: 'SUSPENDED' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body).toEqual({ id: 'gym-1', status: 'SUSPENDED' });
  });
});
