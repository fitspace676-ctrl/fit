import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/**
 * Cart + checkout — the member-facing online shop's server-side cart (T7.7).
 *
 * {@link CartController} (`/cart`) is `@Public()` and reached both signed-in and
 * anonymously; its tenant/identity is established by `SubdomainTenantMiddleware`
 * (guests) and {@link CartIdentityMiddleware} (members), wired in `AppModule`.
 * The base Prisma client + tenant context come from the app-wide `PrismaModule` /
 * `TenantModule`; {@link AuthModule} is imported for the {@link TokenService} the
 * identity middleware verifies session tokens with.
 */
@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
