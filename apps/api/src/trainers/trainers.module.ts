import { Module } from '@nestjs/common';
import { TrainersController } from './trainers.controller';
import { TrainersService } from './trainers.service';

/**
 * Trainers: the public trainer-discovery surface (`GET /trainers`).
 *
 * Registers only its controller + service. The endpoint is `@Public()` and
 * excluded from the JWT `TenantMiddleware` (see `AppModule`), so an
 * unauthenticated visitor on a gym subdomain can browse the roster. The real
 * Prisma-backed query is wired in Phase 5 (see {@link TrainersService}).
 */
@Module({
  controllers: [TrainersController],
  providers: [TrainersService],
})
export class TrainersModule {}
