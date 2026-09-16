// @fit/admin — the branch (location) the console is currently scoped to.
//
// THE COOKIE IS THE AMBIENT TRUTH; `?locationId=` IS AN EXPLICIT OVERRIDE.
//
// The obvious design — keep the selection in the URL only — does not survive
// contact with the console. Every internal link on ~25 pages would have to carry
// the param forward, or the filter silently resets the moment anyone clicks a
// row, a breadcrumb or a nav item. That is dozens of link sites to change and one
// forgotten `<Link>` away from a filter that quietly lies. A cookie costs nothing
// per link and is correct on a bare navigation.
//
// The cookie alone is not enough either: a report drilldown or a link pasted into
// chat has to be able to name its branch, and the back button has to restore one.
// So the URL wins where it is present, and the cookie answers everywhere else.
//
// THREE SPELLINGS OF "EVERY BRANCH", ONE NORMALISATION. The switcher says `'all'`
// (a `<select>` cannot carry `undefined` as an option value), the schedule board's
// page-local filter says `''` (its `setParams` deletes an empty param), and the
// API says `undefined` (an absent query key). {@link locationFilter} is the ONE
// place those meet — call it at the fetch boundary and nothing downstream has to
// know the other two exist. `lib/api.ts` already drops empty-string query values,
// so no request can end up carrying a literal `locationId=all`.
//
// This is a plain module, not a `'use client'` one, for the same reason
// `lib/sidebar-collapse.ts` is: the console layout (a Server Component) and the
// switcher (a Client Component) both import these, and exports pulled out of a
// `'use client'` module arrive on the server as client-reference stubs rather
// than the values themselves. Nothing here may touch `next/headers` either — the
// server-side reader lives in `lib/active-location-server.ts`.

/**
 * Cookie the active branch is persisted under.
 *
 * Deliberately the same name the switcher's `localStorage` key used to be: only
 * the storage medium changed (localStorage is invisible to Server Components,
 * which is why the old switcher could never reach a fetch), not the concept.
 */
export const ACTIVE_LOCATION_COOKIE = 'fit-admin-active-location';

/** Sentinel meaning "every branch, shown together". */
export const ALL_LOCATIONS = 'all';

/**
 * Sentinel meaning "no branch this session may look at" — a role scoped to its
 * assigned branches that is rostered to none of the gym's live ones.
 *
 * It is a real value sent to the API as `locationId=none` rather than the
 * `undefined` that {@link ALL_LOCATIONS} normalises to, and that difference is
 * the whole point: "nothing" and "everything" are opposite answers, and letting
 * an empty permitted set fall through to `undefined` would hand a person with no
 * branches the entire gym. No location can ever carry this id (ids are cuids), so
 * every filtered query comes back empty — which is the correct rendering of "you
 * are not rostered anywhere".
 *
 * The dashboard layout refuses the console outright in this case, so this is the
 * belt to that pair of braces: it holds even for a fetch that runs before the
 * redirect lands.
 */
export const NO_LOCATION = 'none';

/** The query key an explicit per-page override is carried under. */
export const LOCATION_PARAM = 'locationId';

/** The shape this module needs of a location — id only; callers pass richer rows. */
export interface LocationRef {
  id: string;
}

/**
 * Narrow one candidate to a value we are willing to act on: the sentinel, or an
 * id the gym actually has a live location for. Anything else — a deactivated
 * branch, a deleted one, a hand-typed id, a value left over from another gym —
 * degrades to {@link ALL_LOCATIONS} rather than throwing or 404-ing. A stale
 * bookmark must show the operator *more* data than they asked for, never an
 * error page and never a silently empty table.
 */
function accept(candidate: string, locations: readonly LocationRef[]): string {
  if (candidate === ALL_LOCATIONS) {
    return ALL_LOCATIONS;
  }
  return locations.some((location) => location.id === candidate) ? candidate : ALL_LOCATIONS;
}

/**
 * Resolve the branch a request is scoped to.
 *
 * Precedence is explicit param → cookie → all branches. An explicit param that
 * names a branch this gym does not have does NOT fall through to the cookie: the
 * link asked for a specific branch, and answering with a different one would be
 * worse than answering with all of them.
 *
 * An empty or whitespace-only param counts as absent, matching the schedule
 * board's `''`-means-cleared convention and `lib/api.ts`'s empty-value dropping —
 * `?locationId=` therefore hands back to the cookie rather than forcing "all".
 *
 * @returns `ALL_LOCATIONS` or one of `locations`' ids — never anything else.
 */
export function resolveActiveLocation(
  param: string | undefined,
  cookieValue: string | undefined,
  locations: readonly LocationRef[],
): string {
  const explicit = param?.trim();
  if (explicit) {
    return accept(explicit, locations);
  }

  const stored = cookieValue?.trim();
  if (stored) {
    return accept(stored, locations);
  }

  return ALL_LOCATIONS;
}

/**
 * How much of the gym a session may scope the console to — the branch half of
 * the permission answer, in the vocabulary this module already speaks.
 *
 * Kept here, as plain data, rather than in `lib/console-permissions.ts` where it
 * is derived: the switcher, the cookie resolver and the fetch boundary all need
 * it, and two of the three have no business importing the permission model.
 * `lib/console-permissions.ts`'s `branchAccess()` is the one place it is built.
 */
export interface BranchAccess {
  /**
   * Whether "All locations" is a choice at all. False for a role scoped to its
   * assigned branches — for such a person "every branch" is not one of their
   * branches, it is the absence of the restriction.
   */
  canSelectAll: boolean;
  /** The branch ids the session may select, in roster order. */
  allowed: readonly string[];
}

/** Unrestricted access, for a caller that has no scope to apply (tests, previews). */
export const ALL_BRANCHES_ALLOWED: BranchAccess = { canSelectAll: true, allowed: [] };

/**
 * Narrow a resolved branch choice to one the session is actually permitted.
 *
 * {@link resolveActiveLocation} answers "what did the request ask for, and does
 * the gym have it"; this answers "and may THIS PERSON have it". They are separate
 * passes because the first is about the gym's roster and the second is about the
 * operator, and collapsing them would mean the cookie resolver had to know about
 * permissions.
 *
 * A gym-wide session is returned untouched. A restricted one keeps its choice
 * only if it is one of theirs; anything else — the "all branches" sentinel, a
 * `?locationId=` pasted from a colleague's link, a cookie left over from before
 * their scope was narrowed — lands on their FIRST permitted branch rather than on
 * the one they asked for. Landing somewhere they hold is what makes the
 * restriction a boundary instead of a hint; erroring instead would punish an
 * ordinary stale bookmark.
 *
 * With no permitted branches at all the answer is {@link NO_LOCATION}, which
 * filters everything out rather than falling open to the gym.
 */
export function clampActiveLocation(active: string, access: BranchAccess): string {
  if (access.canSelectAll) {
    return active;
  }
  if (access.allowed.includes(active)) {
    return active;
  }
  return access.allowed[0] ?? NO_LOCATION;
}

/**
 * The value to send to the API: `undefined` for "all branches".
 *
 * The single normalisation boundary between the UI's `'all'`, the schedule
 * board's `''` and the API's `undefined`. Every fetch that filters by branch
 * should get its `locationId` from here and nowhere else.
 *
 * {@link NO_LOCATION} deliberately passes straight through as an id. It is the
 * one value that must NOT normalise to `undefined`: "no branch" and "every
 * branch" are opposite answers, and a session with no permitted branch has to
 * come back empty rather than gym-wide.
 */
export function locationFilter(active: string): string | undefined {
  const value = active.trim();
  return value === '' || value === ALL_LOCATIONS ? undefined : value;
}
