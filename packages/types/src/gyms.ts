// @fit/types — gym provisioning + owner onboarding contracts.
//
// Shapes crossing the API boundary for tenant provisioning (T2.11): the
// `POST /auth/register-gym` owner-signup flow and the SUPER_ADMIN-only
// `GET /gyms` listing. The API validates inbound bodies with these Zod schemas
// and the platform / superadmin clients reuse the inferred types so the
// request/response contract never drifts between sender and receiver.

import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth';

/** Minimum length of a gym slug (the tenant's subdomain label). */
export const GYM_SLUG_MIN_LENGTH = 3;
/** Maximum length of a gym slug — comfortably within a DNS label's 63 chars. */
export const GYM_SLUG_MAX_LENGTH = 40;

/**
 * Subdomain labels a tenant may never claim, because they name platform-level
 * hosts (`www.fit.ge`, `api.fit.ge`, the admin/operator consoles, …) or common
 * infrastructure aliases. Provisioning one as a tenant slug would let a gym
 * shadow a platform host, so the slug schema rejects them and the subdomain
 * tenant middleware never resolves them to a tenant. Kept lower-case to match
 * the normalised slug.
 */
export const RESERVED_SUBDOMAINS: readonly string[] = [
  'www',
  'app',
  'api',
  'admin',
  'platform',
  'superadmin',
  'auth',
  'login',
  'mail',
  'email',
  'static',
  'assets',
  'cdn',
  'status',
  'help',
  'support',
  'docs',
  'dashboard',
];

/**
 * A gym slug doubles as the tenant's subdomain (`<slug>.fit.ge`), so it is held
 * to DNS-label rules: lowercase alphanumerics and internal hyphens only, never
 * leading/trailing or doubled hyphens. Normalised to lower-case + trimmed so a
 * single tenant can't be provisioned twice under differing case. Reserved
 * platform labels ({@link RESERVED_SUBDOMAINS}) are rejected so a tenant can't
 * shadow a platform host.
 */
export const gymSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(GYM_SLUG_MIN_LENGTH)
  .max(GYM_SLUG_MAX_LENGTH)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'slug must be lowercase alphanumerics separated by single hyphens',
  )
  .refine((slug) => !RESERVED_SUBDOMAINS.includes(slug), {
    message: 'slug is reserved for platform use',
  });

/**
 * Body for `POST /auth/register-gym`. Provisions a new tenant and onboards its
 * first OWNER in one call. The gym `name` is the display name and `slug` the
 * subdomain label; the owner is identified by `ownerEmail` (an existing account
 * is reused, otherwise one is created). `ownerName` / `ownerPassword` are only
 * consulted when the owner account is created — `ownerPassword`, when supplied,
 * is held to the same length bounds registration enforces; when omitted the
 * owner finishes onboarding via the emailed link (and can set a password later
 * through the reset flow). The CLI's `fit gym create` posts exactly this shape.
 */
export const registerGymSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: gymSlugSchema,
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerName: z.string().trim().min(1).max(100).optional(),
  ownerPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).optional(),
});

export type RegisterGymInput = z.infer<typeof registerGymSchema>;

/** The provisioned tenant as returned to the caller. */
export interface GymRef {
  id: string;
  name: string;
  slug: string;
}

/**
 * Successful `POST /auth/register-gym` response. Returns the freshly-provisioned
 * gym and the owner it was bound to, plus a human-readable `message`. No session
 * is issued here: the owner finishes onboarding through the emailed link (which
 * verifies their address and issues the first session), mirroring how plain
 * registration defers the session to email verification.
 */
export interface RegisterGymResponse {
  gym: GymRef;
  owner: {
    id: string;
    email: string;
  };
  message: string;
}

/** A single gym as listed by `GET /gyms`. */
export interface GymSummary {
  id: string;
  name: string;
  slug: string;
  /** The owning user's id, or `null` for a gym not yet bound to an owner. */
  ownerId: string | null;
  /** Total memberships in the gym (across every role and status). */
  memberCount: number;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * Successful `GET /gyms` response — the platform-wide gym roster. Cross-tenant
 * by nature, so the endpoint is restricted to `SUPER_ADMIN`.
 */
export interface ListGymsResponse {
  gyms: GymSummary[];
}

/**
 * Successful `GET /gyms/by-subdomain/:slug` response — the public tenant lookup
 * a subdomain (`<slug>.fit.ge`) resolves to. Deliberately minimal: it exposes
 * only what an unauthenticated visitor needs to render a tenant's entry page,
 * never the roster fields (`ownerId`, `memberCount`). A missing/unknown slug is
 * a `404 { code: "GYM_NOT_FOUND" }`.
 */
export interface GymBySubdomainResponse {
  gymId: string;
  name: string;
  /**
   * Tenant branding (logo, colours). Not modelled until gym settings (T4.8), so
   * `null` for now; the field is present so clients can bind to it without a
   * contract change once branding lands.
   */
  brand: null;
}
