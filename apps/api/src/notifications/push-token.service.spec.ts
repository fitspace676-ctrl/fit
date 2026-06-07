import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { DevicePlatform } from '@fit/db';
import type { RegisterPushTokenData } from '@fit/types';
import { PushTokenService } from './push-token.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const USER_ID = 'user-1';
const DEVICE_ID = 'device-abc';

/** A loose view of the query args the service passes — enough to assert on. */
interface QueryArgs {
  where?: Record<string, unknown>;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

function setup(opts?: { userId?: string | null; existing?: { id: string } | null }) {
  const pushToken = {
    findUnique: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    upsert: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    deleteMany: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
  };
  const client = { pushToken };

  pushToken.findUnique.mockResolvedValue(opts?.existing === undefined ? null : opts.existing);
  pushToken.upsert.mockResolvedValue({ id: 'pt-1' });
  pushToken.deleteMany.mockResolvedValue({ count: 1 });

  const prisma = { client } as unknown as PrismaService;
  const tenant = {
    userId: opts?.userId === undefined ? USER_ID : opts.userId,
  } as unknown as TenantContext;

  return { service: new PushTokenService(prisma, tenant), pushToken };
}

function body(over?: Partial<RegisterPushTokenData>): RegisterPushTokenData {
  return {
    token: over?.token ?? 'ExponentPushToken[xxx]',
    deviceId: over?.deviceId ?? DEVICE_ID,
    platform: over?.platform ?? 'ios',
  };
}

describe('PushTokenService', () => {
  describe('register', () => {
    it('rejects an unauthenticated caller with MEMBER_SESSION_REQUIRED', async () => {
      const { service, pushToken } = setup({ userId: null });
      await expect(service.register(body())).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: { code: 'MEMBER_SESSION_REQUIRED' },
      });
      expect(pushToken.upsert).not.toHaveBeenCalled();
    });

    it('creates a new registration and reports created:true', async () => {
      const { service, pushToken } = setup({ existing: null });
      const result = await service.register(body({ platform: 'ios' }));

      expect(result).toEqual({ id: 'pt-1', created: true });
      const args = pushToken.upsert.mock.calls[0]?.[0];
      expect(args?.where).toEqual({ userId_deviceId: { userId: USER_ID, deviceId: DEVICE_ID } });
      expect(args?.create).toMatchObject({
        userId: USER_ID,
        deviceId: DEVICE_ID,
        token: 'ExponentPushToken[xxx]',
        platform: DevicePlatform.IOS,
      });
    });

    it('updates an existing registration in place and reports created:false', async () => {
      const { service, pushToken } = setup({ existing: { id: 'pt-1' } });
      const result = await service.register(body({ token: 'ExponentPushToken[rotated]' }));

      expect(result).toEqual({ id: 'pt-1', created: false });
      const args = pushToken.upsert.mock.calls[0]?.[0];
      expect(args?.update).toEqual({
        token: 'ExponentPushToken[rotated]',
        platform: DevicePlatform.IOS,
      });
    });

    it('maps the android wire platform to the DevicePlatform enum', async () => {
      const { service, pushToken } = setup({ existing: null });
      await service.register(body({ platform: 'android' }));

      const args = pushToken.upsert.mock.calls[0]?.[0];
      expect(args?.create).toMatchObject({ platform: DevicePlatform.ANDROID });
    });
  });

  describe('unregister', () => {
    it('rejects an unauthenticated caller with MEMBER_SESSION_REQUIRED', async () => {
      const { service, pushToken } = setup({ userId: null });
      await expect(service.unregister(DEVICE_ID)).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: { code: 'MEMBER_SESSION_REQUIRED' },
      });
      expect(pushToken.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes the caller-scoped device registration (idempotent)', async () => {
      const { service, pushToken } = setup();
      await service.unregister(DEVICE_ID);

      expect(pushToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, deviceId: DEVICE_ID },
      });
    });
  });
});
