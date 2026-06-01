import { Module } from '@nestjs/common';
import { AppleOAuthService } from './apple-oauth.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenService } from './token.service';

/**
 * Auth: serves email/password registration + verification, password login,
 * Google + Apple OAuth login, and refresh-token rotation.
 *
 * Depends on the globally-provided `PrismaService` and `RedisService`, so it
 * only needs to register its own providers — {@link AuthService} plus the
 * {@link TokenService} (session issuance), {@link EmailService} (Resend
 * delivery), and the {@link GoogleOAuthService} / {@link AppleOAuthService}
 * (OAuth ID-token verification) it composes.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService, EmailService, GoogleOAuthService, AppleOAuthService],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
