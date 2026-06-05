import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

/**
 * Classes: the public class-discovery surface (`GET /class-instances`).
 *
 * Registers only its controller + service. The endpoint is `@Public()` and
 * excluded from the JWT `TenantMiddleware` (see `AppModule`), so an
 * unauthenticated visitor on a gym subdomain can browse the schedule. The real
 * `ClassInstance`-backed query is wired in Phase 5 (see {@link ClassesService}).
 */
@Module({
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
