import { Injectable, type NestMiddleware } from '@nestjs/common';
import { GymStatus, Role } from '@fit/db';
import { RESERVED_SUBDOMAINS } from '@fit/types';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantStorage, type TenantState } from '../tenant/tenant.context';

/**
 * Recover a tenant slug from a request `Host`, given the platform root domain.
 *
 * Returns the single subdomain label of `<slug>.<rootDomain>` — lower-cased,
 * port-stripped — or `null` when the host is the bare root domain, isn't under
 * the root domain at all, carries a multi-level subdomain (`a.b.fit.ge`), or is
 * a {@link RESERVED_SUBDOMAINS} platform label. Exported for direct testing.
 */
export function extractTenantSlug(host: string | undefined, rootDomain: string): string | null {
  if (!host) {
    return null;
  }
  // `x-forwarded-host` may carry a list; take the first hop. Then drop the port.
  const hostname = host.split(',')[0]!.split(':')[0]!.trim().toLowerCase();
  if (!hostname) {
    return null;
  }

  const suffix = `.${rootDomain}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  const label = hostname.slice(0, -suffix.length);
  // Empty (bare root domain), multi-level (`a.b.fit.ge`), or a reserved platform
  // label is never a tenant.
  if (!label || label.includes('.') || RESERVED_SUBDOMAINS.includes(label)) {
    return null;
  }
  return label;
}

/**
 * Establishes the per-request tenant for **public / unauthenticated** routes
 * from the request subdomain (`<slug>.fit.ge` → `gymId`), the counterpart to
 * the JWT-based {@link TenantMiddleware}.
 *
 * It is a fallback, not an override: a request carrying an `Authorization`
 * header is left for the JWT middleware to scope (a session always wins over the
 * host), and a request with no tenant subdomain passes through untouched. When a
 * tenant subdomain *does* resolve to an active gym, it opens the same
 * {@link tenantStorage} store the JWT path uses — with `userId: null` (no
 * session) — so a public handler and the Prisma tenant extension scope to that
 * gym automatically.
 *
 * An unknown or suspended subdomain is deliberately **not** rejected here: these
 * routes are public, so the request simply proceeds with no tenant in scope and
 * any handler that genuinely needs one fails closed on its own.
 */
@Injectable()
export class SubdomainTenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // A session-bearing request is scoped by its JWT — don't shadow it.
    if (req.headers.authorization) {
      next();
      return;
    }

    const forwarded = req.headers['x-forwarded-host'];
    const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? req.headers.host;
    const slug = extractTenantSlug(host, env.PLATFORM_ROOT_DOMAIN);
    if (!slug) {
      next();
      return;
    }

    const gym = await this.prisma.client.gym.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!gym || gym.status !== GymStatus.ACTIVE) {
      next();
      return;
    }

    const state: TenantState = {
      userId: null,
      gymId: gym.id,
      // No authenticated principal — least privilege. Inert on @Public routes
      // (RBAC guards don't run there); present only to satisfy the tenant shape.
      role: Role.MEMBER,
      allowCrossTenant: false,
    };
    tenantStorage.run(state, () => next());
  }
}
