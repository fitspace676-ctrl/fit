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
  googleAuthSchema,
  loginSchema,
  refreshSchema,
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

  /** `POST /auth/login` — authenticate an email/password pair and issue a session. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown): Promise<TokenPair> {
    const input = parse(loginSchema, body);
    return this.auth.login(input);
  }

  /** `POST /auth/google` — verify a Google ID token and issue a session. */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async google(@Body() body: unknown): Promise<TokenPair> {
    const input = parse(googleAuthSchema, body);
    return this.auth.loginWithGoogle(input);
  }

  /** `POST /auth/refresh` — rotate the refresh token and issue a fresh session. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown): Promise<TokenPair> {
    const input = parse(refreshSchema, body);
    return this.auth.refresh(input);
  }

  /** `POST /auth/logout` — revoke the refresh token's family, ending the session. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown): Promise<void> {
    const input = parse(refreshSchema, body);
    await this.auth.logout(input);
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
