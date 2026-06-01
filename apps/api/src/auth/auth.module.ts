import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenService } from './token.service';

/**
 * Auth: serves email/password registration + verification, password login,
 * Google OAuth login, and refresh-token rotation.
 *
 * Depends on the globally-provided `PrismaService` and `RedisService`, so it
 * only needs to register its own providers — {@link AuthService} plus the
 * {@link TokenService} (session issuance), {@link EmailService} (Resend
 * delivery), and {@link GoogleOAuthService} (Google ID-token verification) it
 * composes.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService, EmailService, GoogleOAuthService],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
