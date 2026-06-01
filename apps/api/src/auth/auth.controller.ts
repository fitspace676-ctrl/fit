import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  registerSchema,
  verifyEmailSchema,
  type RegisterResponse,
  type TokenPair,
} from '@fit/types';
import { AuthService } from './auth.service';

/**
 * Auth endpoints for email/password registration + verification.
 *
 * Bodies / queries are validated against the shared `@fit/types` Zod schemas by
 * hand: the API runs no global `ValidationPipe`, and parsing here keeps the
 * request contract co-located with the route. A failed parse becomes a `400`
 * whose per-field messages surface as the error body's `details`.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** `POST /auth/register` — create an account and send the verification email. */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown): Promise<RegisterResponse> {
    const input = parse(registerSchema, body);
    return this.auth.register(input);
  }

  /** `GET /auth/verify?token=…` — verify the email and issue the first session. */
  @Get('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Query() query: unknown): Promise<TokenPair> {
    const { token } = parse(verifyEmailSchema, query);
    return this.auth.verifyEmail(token);
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose `details` list each failing
 * field. Centralised so every route reports validation errors identically.
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
