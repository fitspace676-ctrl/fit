// @fit/types — gym provisioning + owner onboarding contracts.
//
// Shapes crossing the API boundary for tenant provisioning (T2.11): the
// `POST /auth/register-gym` owner-signup flow and the SUPER_ADMIN-only
// `GET /gyms` listing. The API validates inbound bodies with these Zod schemas
// and the platform / superadmin clients reuse the inferred types so the
// request/response contract never drifts between sender and receiver.

import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth';
import type { GymPortalTheme, GymPublicBrand, GymPublicContact } from './gym-settings';

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
 * first OWNER in one call. `gymName` is the display name and `subdomainSlug` the
 * subdomain label (`<subdomainSlug>.fit.ge`); the owner is always a *new*
 * account identified by `ownerEmail` — an already-registered email is rejected
 * with `409 EMAIL_TAKEN` rather than silently bound as the owner. `ownerName`
 * and `password` are optional: `password`, when supplied, is held to the same
 * length bounds registration enforces; when omitted the owner finishes
 * onboarding via the emailed link and sets a password through the reset flow.
 * The CLI's `fit gym create` posts this shape.
 */
export const registerGymSchema = z.object({
  gymName: z.string().trim().min(1).max(100),
  subdomainSlug: gymSlugSchema,
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerName: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).optional(),
});

export type RegisterGymInput = z.infer<typeof registerGymSchema>;

/**
 * Successful `POST /auth/register-gym` response (`201`). Returns the provisioned
 * tenant's id, its subdomain slug, and the new owner's user id. No session is
 * issued here: the owner finishes onboarding through the emailed link (which
 * verifies their address and issues the first session), mirroring how plain
 * registration defers the session to email verification.
 */
export interface RegisterGymResponse {
  gymId: string;
  subdomainSlug: string;
  ownerUserId: string;
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
   * Public tenant branding — the logo + brand colours a visitor's entry page
   * renders (gym settings, T4.8). Populated from the gym's stored settings,
   * falling back to the platform palette so a brand is always renderable;
   * `null` only if a future caller deliberately omits it.
   */
  brand: GymPublicBrand | null;
  /**
   * The IANA zone the gym's wall-clock times are read in (`Asia/Tbilisi` by
   * default). The portal renders every class and booking time in it rather than
   * in the viewer's zone — see `gymPublicTimezone`.
   */
  timezone: string;
  /**
   * The gym's public contact details (address, phone, email, website) as filled in
   * under Settings → Business info — what the member portal's footer offers a
   * visitor to reach the gym on. Every field is independently nullable; a gym that
   * has filled in nothing yields four `null`s and the portal renders no footer.
   */
  contact: GymPublicContact | null;
  /**
   * The member portal's skin — the sign-in photograph and the two colours the
   * public site paints itself in, already resolved against the brand by
   * `gymPortalTheme` so both colours are always renderable.
   *
   * Travels with this lookup rather than being fetched separately because the
   * portal's very first paint — the sign-in screen, before anyone has a session —
   * is the one that needs it, and this call is the only thing that has already
   * run by then. Kept apart from `brand` because a gym may want a lime portal
   * without a lime invoice.
   */
  portal: GymPortalTheme;
}
