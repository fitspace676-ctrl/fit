// @fit/platform — gym-name → subdomain-slug suggestion.
//
// Client-side convenience only: the signup form pre-fills the subdomain field
// from the gym name as the owner types, until they edit the slug themselves.
// The API re-validates the submitted slug with `gymSlugSchema` (the single
// source of truth), so this never needs to be exhaustive — it just produces a
// reasonable starting point that usually passes that schema.

/** Combining diacritical marks left behind by NFKD decomposition. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Derive a DNS-label-friendly subdomain slug from free-form text: lowercased,
 * accents stripped, every run of non-alphanumerics collapsed to a single
 * hyphen, leading/trailing hyphens removed, and clamped to the slug max length.
 * Mirrors the shape `gymSlugSchema` accepts (lowercase alphanumerics separated
 * by single hyphens) so the suggestion typically validates as-is.
 */
export function slugifyGymName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
