import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { TokenService } from './token.service';

/**
 * Email/password auth: serves `POST /auth/register` and `GET /auth/verify`.
 *
 * Depends on the globally-provided `PrismaService` and `RedisService`, so it
 * only needs to register its own providers — {@link AuthService} plus the
 * {@link TokenService} (session issuance) and {@link EmailService} (Resend
 * delivery) it composes.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService, EmailService],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
