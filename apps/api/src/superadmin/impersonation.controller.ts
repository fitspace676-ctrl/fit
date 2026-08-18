import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { z } from 'zod';
import { impersonationExchangeSchema, type ImpersonationExchangeResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { SuperAdminService } from './superadmin.service';

/**
 * Impersonation handoff redemption (`POST /auth/impersonation/exchange`).
 *
 * Deliberately **`@Public()`**, and deliberately mounted under `auth/`. Both are
 * load-bearing: the `auth/` prefix is excluded from `TenantMiddleware`, and
 * `@Public()` opts out of the global deny-by-default {@link PermissionsGuard}.
 * This route is called by the tenant console's server before any session exists,
 * so there is no bearer token to establish a tenant or a permission from. The
 * single-use code IS the credential, and
 * {@link SuperAdminService.exchangeImpersonationCode} consumes it under a
 * delete-wins race guard — one redemption, then it is worthless.
 *
 * It lives beside the console's own controller rather than in `AuthModule`
 * because it is the second half of one flow: `POST /admin/gyms/:id/impersonate`
 * issues the code, this redeems it, and both audit against the same actor.
 */
@Public()
@Controller('auth/impersonation')
export class ImpersonationController {
  constructor(private readonly superadmin: SuperAdminService) {}

  /** `POST /auth/impersonation/exchange` — turn a handoff code into a session. */
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() body: unknown): Promise<ImpersonationExchangeResponse> {
    const { code } = parse(impersonationExchangeSchema, body);
    return this.superadmin.exchangeImpersonationCode(code);
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose `details` list each failing
 * field — mirroring `AuthController` so validation errors read identically
 * across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    throw new BadRequestException(details);
  }
  return result.data as z.infer<TSchema>;
}
