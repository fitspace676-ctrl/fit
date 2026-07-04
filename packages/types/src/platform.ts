import { z } from 'zod';

/**
 * Platform marketing lead capture (T8.2).
 *
 * The public marketing site's two lead forms — the free-trial signup and the
 * book-a-demo request — post to `POST /platform/leads`. This is the wire contract
 * shared between that Next.js client and the NestJS controller: the discriminating
 * `type`, the always-required contact fields, and the form-specific optionals
 * (`business` for a trial, `phone` / `message` for a demo).
 */

/** The marketing form a lead came from. */
export const PLATFORM_LEAD_TYPES = ['trial', 'demo'] as const;

/** Lead source — a member of {@link PLATFORM_LEAD_TYPES}. */
export const platformLeadTypeSchema = z.enum(PLATFORM_LEAD_TYPES);

/** The wire-level lead source (`'trial' | 'demo'`). */
export type PlatformLeadType = z.infer<typeof platformLeadTypeSchema>;

/**
 * An optional free-text field where the client may send `""` (an untouched input)
 * or omit it entirely: trim, cap the length, and normalise a blank / null / missing
 * value to `undefined` so it is stored as absent rather than an empty string.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value == null || value === '' ? undefined : value));

/**
 * Body of `POST /platform/leads`. Contact `name` + `email` are required for both
 * forms; `business`, `phone` and `message` are optional (present on one form or
 * the other) and trimmed, with empty strings normalised to absent.
 */
export const createPlatformLeadSchema = z.object({
  type: platformLeadTypeSchema,
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required').max(200),
  business: optionalText(160),
  phone: optionalText(40),
  message: optionalText(2000),
});

/** Validated `POST /platform/leads` payload. */
export type CreatePlatformLeadInput = z.infer<typeof createPlatformLeadSchema>;

/** Response of a successful `POST /platform/leads` — the stored lead's id. */
export interface CreatePlatformLeadResponse {
  id: string;
}
