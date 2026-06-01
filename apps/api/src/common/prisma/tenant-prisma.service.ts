import { Injectable } from '@nestjs/common';
import { prisma } from '@fit/db';
import { tenantExtension } from './prisma-tenant.extension';

/**
 * Tenant-scoped Prisma client. Wraps the shared `@fit/db` singleton with the
 * {@link tenantExtension} once at construction; because the extension reads the
 * active tenant from the request's {@link tenantStorage} store at query time,
 * this single instance serves every request safely.
 *
 * Request handlers that touch gym-scoped data depend on **this** service rather
 * than the raw {@link PrismaService}, so isolation is applied automatically and
 * can never be forgotten. {@link PrismaService} stays available for the few
 * deliberately cross-tenant flows (auth operating on `User`, health checks).
 */
@Injectable()
export class TenantPrismaService {
  /** The tenant-scoped client — query models off `this.client`. */
  readonly client = prisma.$extends(tenantExtension());
}
