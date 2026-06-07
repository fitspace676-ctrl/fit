import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Permission, registerPushTokenSchema, type RegisterPushTokenResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PushTokenService } from './push-token.service';

/**
 * Push-device registration endpoints (`/notifications/push-token`, T6.10).
 *
 * The member app registers its Expo push token after login and unregisters it on
 * logout (or when the token rotates). Both sit behind {@link TenantGuard} + the
 * global {@link PermissionsGuard} and require {@link Permission.NotificationManage}
 * (granted to `MEMBER`) — a self-service capability: the caller manages *their
 * own* device, resolved from the session, so neither the owning user nor the gym
 * is ever read off the wire. The owning-user scoping lives in
 * {@link PushTokenService}, which runs unscoped (a push token is per-person, not
 * per-gym).
 */
@Controller('notifications/push-token')
@UseGuards(TenantGuard, PermissionsGuard)
export class PushTokenController {
  constructor(private readonly pushTokens: PushTokenService) {}

  /**
   * `POST /notifications/push-token` — register or refresh this device's token.
   * Upserts on `(userId, deviceId)`: a new device is `201 Created`, a
   * re-registration (e.g. a rotated token on app upgrade) is `200 OK`. The body
   * is validated up front (`400` on a malformed token / deviceId / platform).
   */
  @Post()
  @RequirePermissions(Permission.NotificationManage)
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterPushTokenResponse> {
    const { id, created } = await this.pushTokens.register(parse(registerPushTokenSchema, body));
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { id };
  }

  /**
   * `DELETE /notifications/push-token/:deviceId` — unregister this device.
   * Idempotent: removing a device with no live registration is still `204`.
   */
  @Delete(':deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.NotificationManage)
  async unregister(@Param('deviceId') deviceId: string): Promise<void> {
    await this.pushTokens.unregister(deviceId);
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
