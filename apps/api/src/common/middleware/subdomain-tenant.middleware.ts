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

/** Request headers as Node hands them over: a value, a list of values, or absent. */
export type TenantHeaders = Record<string, string | string[] | undefined>;

/** Header the web/admin servers stamp on server-side calls with the tenant host they serve. */
export const TENANT_HOST_HEADER = 'x-tenant-host';

/** First value of a possibly-repeated header. */
function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The `host=` parameter of the **first** element of an RFC 7239 `Forwarded`
 * header — the hop closest to the client — or `undefined` when that element
 * names none. Parameter names are case-insensitive and a value may be a quoted
 * string (`host="acme.fit.ge:443"`); later elements are never consulted, since
 * they describe proxies further in, not the host the client asked for.
 */
export function parseForwardedHost(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (!value) {
    return undefined;
  }

  // Split off the first element at the first comma outside a quoted string.
  let inQuotes = false;
  let end = value.length;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\' && inQuotes) {
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      end = i;
      break;
    }
  }

  for (const pair of value.slice(0, end).split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq).trim().toLowerCase() !== 'host') {
      continue;
    }
    let host = pair.slice(eq + 1).trim();
    if (host.startsWith('"') && host.endsWith('"') && host.length >= 2) {
      host = host.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    return host || undefined;
  }
  return undefined;
}

/**
 * The host a request's tenant should be read from, or `null` when no candidate
 * names a tenant under `rootDomain`.
 *
 * Candidates, in order: {@link TENANT_HOST_HEADER} (set by the web/admin
 * servers, whose own calls reach the API under the API's host), the `host=` of
 * the RFC 7239 `Forwarded` header (the only place Railway's edge preserves the
 * client's host), `x-forwarded-host`, then `Host`. Each is validated with
 * {@link extractTenantSlug}; one that names no tenant — the bare root, a
 * reserved label, another domain — is skipped rather than ending the search, so
 * a stale or platform-host `x-tenant-host` cannot mask the real one.
 *
 * Choosing a tenant from a header is safe only because it is a *selector*:
 * public routes serve public data, and an authenticated request's scope always
 * comes from its JWT.
 */
export function resolveTenantHost(headers: TenantHeaders, rootDomain: string): string | null {
  const candidates = [
    firstHeader(headers[TENANT_HOST_HEADER]),
    parseForwardedHost(headers.forwarded),
    firstHeader(headers['x-forwarded-host']),
    firstHeader(headers.host),
  ];
  for (const candidate of candidates) {
    if (extractTenantSlug(candidate, rootDomain)) {
      return candidate!;
    }
  }
  return null;
}

/** The tenant slug {@link resolveTenantHost} settles on, or `null`. */
export function resolveTenantSlug(headers: TenantHeaders, rootDomain: string): string | null {
  return extractTenantSlug(resolveTenantHost(headers, rootDomain) ?? undefined, rootDomain);
}

/**
 * Establishes the per-request tenant for **public / unauthenticated** routes
 * from the request subdomain (`<slug>.fit.ge` → `gymId`, read through
 * {@link resolveTenantHost}), the counterpart to
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

    const slug = resolveTenantSlug(req.headers, env.PLATFORM_ROOT_DOMAIN);
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
