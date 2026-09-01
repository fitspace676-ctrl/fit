// @fit/types — per-gym, runtime-editable role permissions.
//
// `./permissions` states what a role can do as the product SHIPS. This module is
// what a gym can change about that: which capabilities each staff role holds, and
// whether the role sees every branch or only the ones it is rostered to. It is the
// storage contract (a `permissions` section on `Gym.settings`), the resolver both
// the API guard and the console read through, and the editor's own model of the
// screen.
//
// Three properties hold this together, and each exists to prevent a specific
// failure:
//
//   • ABSENT MEANS THE BUILT-IN DEFAULTS. Every field normalises rather than
//     rejects, so a gym that has never opened the editor resolves to exactly
//     {@link ROLE_PERMISSIONS} — no backfill, no migration, and clearing an
//     override returns to sane behaviour instead of to an empty role.
//
//   • OWNER IS LOCKED. It is a system role: every permission, every branch,
//     enforced when the blob is PARSED rather than when a caller remembers to
//     check. Without that, an owner can untick their own `GymManage` and nobody
//     can ever reopen the screen — including the person who has to undo it.
//
//   • THE EDITOR CANNOT OFFER A CELL THAT WRITES NOWHERE. Self-service
//     capabilities and the two that gate nothing are excluded from the model
//     entirely, and a row states in its TYPE whether it has one column or two,
//     so a greyed-out checkbox is unrepresentable rather than merely discouraged.
//
// Zod and plain data only — no Node built-ins. The API guard, React server
// components and the browser bundle all resolve through the same function, so any
// disagreement between what the sidebar offers and what the server allows would be
// a bug in one call site rather than in two copies of the rules.

import { z } from 'zod';
import { ALL_PERMISSIONS, Permission, ROLE_PERMISSIONS } from './permissions';
import { staffRoleSchema, type StaffRole } from './staff';

// ---------------------------------------------------------------------------
// Branch scope
// ---------------------------------------------------------------------------

/**
 * How much of a multi-branch gym a role may look at.
 *
 * `all` is the whole gym; `assigned` narrows to the branches the person actually
 * holds `LocationStaff` rows for. This is deliberately NOT a permission: it is an
 * axis that cuts across every capability the role has, so a receptionist who may
 * read members reads *their branch's* members rather than a different set of
 * screens.
 *
 * A role with `assigned` and no branch assignments sees nothing. That is the
 * correct reading of "only where you are rostered", and it fails closed.
 */
export const branchScopeSchema = z.enum(['all', 'assigned']);

/** How much of the gym a role may look at — {@link branchScopeSchema}. */
export type BranchScope = z.infer<typeof branchScopeSchema>;

// ---------------------------------------------------------------------------
// What is editable, and what is not
// ---------------------------------------------------------------------------

/**
 * Capabilities whose subject is the ACTOR, not a resource the gym administers —
 * booking oneself into a class, reviewing a class one attended, registering one's
 * own push device, freezing one's own membership, buying one's own credit pack,
 * editing one's own profile.
 *
 * They are excluded from the staff role editor because there is no coherent thing
 * to grant: unticking "manage subscription" for MANAGER would not restrict what a
 * manager may do to the gym, it would stop that person pausing their own gym
 * membership. Every role holds the ones it needs, permanently, and the resolver
 * puts them back even when an override omits them.
 */
export const SELF_SERVICE_PERMISSIONS: readonly Permission[] = [
  Permission.ClassBook,
  Permission.ReviewWrite,
  Permission.NotificationManage,
  Permission.SubscriptionManage,
  Permission.CreditPackManage,
  Permission.ProfileManage,
];

/**
 * Capabilities that gate nothing today: four roles are granted `workout:read` /
 * `workout:write` and no workouts controller exists to refuse anyone.
 *
 * Offering them in the editor would be worse than useless — an operator would
 * untick "workouts" and observe no change anywhere, which teaches them the whole
 * screen is decorative. They stay in the enum (the grants are real, the feature is
 * merely unbuilt) and out of the editor until there is something behind them.
 */
export const UNENFORCED_PERMISSIONS: readonly Permission[] = [
  Permission.WorkoutRead,
  Permission.WorkoutWrite,
];

/**
 * The capabilities a gym may NOT re-assign — {@link SELF_SERVICE_PERMISSIONS} plus
 * {@link UNENFORCED_PERMISSIONS}. A role's holding of these is fixed by
 * {@link ROLE_PERMISSIONS} and survives every override.
 */
export const NON_EDITABLE_PERMISSIONS: readonly Permission[] = [
  ...SELF_SERVICE_PERMISSIONS,
  ...UNENFORCED_PERMISSIONS,
];

const NON_EDITABLE_SET = new Set<Permission>(NON_EDITABLE_PERMISSIONS);

/**
 * The capabilities the editor may actually toggle, in {@link ALL_PERMISSIONS}
 * order — every permission minus {@link NON_EDITABLE_PERMISSIONS}.
 *
 * This is the closed vocabulary of the stored `grants` array: a value outside it
 * is dropped on read and rejected on write, so a stale or invented capability
 * cannot sit in a gym's settings pretending to grant something.
 */
export const EDITABLE_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (permission) => !NON_EDITABLE_SET.has(permission),
);

const EDITABLE_SET = new Set<Permission>(EDITABLE_PERMISSIONS);

/**
 * Whether `value` is a capability a gym may grant or revoke. Narrows from
 * `unknown` because it is used to sift a JSON blob that no type system has seen —
 * the stored array is whatever was last written to the database.
 */
export function isEditablePermission(value: unknown): value is Permission {
  return typeof value === 'string' && EDITABLE_SET.has(value as Permission);
}

/**
 * A permission list in canonical {@link ALL_PERMISSIONS} order, deduplicated.
 *
 * Every set this module returns goes through here so that two gyms granting the
 * same capabilities store and render byte-identical arrays, and so a diff of the
 * settings blob shows what changed rather than what moved.
 */
function orderPermissions(permissions: Iterable<Permission>): Permission[] {
  const held = new Set(permissions);
  return ALL_PERMISSIONS.filter((permission) => held.has(permission));
}

// ---------------------------------------------------------------------------
// The stored shape
// ---------------------------------------------------------------------------

/** One role's stored entry: what it may do, and how much of the gym it may see. */
export interface RolePermissionsSetting {
  /**
   * The {@link EDITABLE_PERMISSIONS} this role holds. An EMPTY array is a real
   * answer — "this role may do nothing" — and is preserved; only a missing or
   * malformed value falls back to the built-in defaults.
   */
  grants: Permission[];
  /** Whether the role works across the whole gym or only its assigned branches. */
  branchScope: BranchScope;
}

/**
 * The branch scope each staff role starts with.
 *
 * OWNER and MANAGER run the business and are gym-wide. Reception and coaching
 * happen AT a branch — a receptionist checking in members and a trainer reading
 * their roster are asking about the room they are standing in — so both default to
 * `assigned`, which is also the safer half of the default to be wrong about.
 */
export const DEFAULT_BRANCH_SCOPE = {
  OWNER: 'all',
  MANAGER: 'all',
  RECEPTIONIST: 'assigned',
  TRAINER: 'assigned',
} as const satisfies Record<StaffRole, BranchScope>;

/**
 * OWNER's permanent entry: every capability, every branch.
 *
 * A fresh object each call — the console mutates a draft of these rows while the
 * operator edits, and a shared frozen-by-convention array is one careless `push`
 * away from becoming a different gym's grant set.
 */
function lockedOwnerPermissions(): RolePermissionsSetting {
  return { grants: [...ALL_PERMISSIONS], branchScope: 'all' };
}

/**
 * What `role` may do when the gym has never said otherwise — {@link ROLE_PERMISSIONS}
 * narrowed to the editable vocabulary, plus the role's default branch scope.
 *
 * The narrowing is why an override can never lose a self-service capability: those
 * are not in the stored set to begin with, so there is nothing for an unticked box
 * to remove. {@link resolveRolePermissions} adds them back at read time.
 */
export function defaultRolePermissions(role: StaffRole): RolePermissionsSetting {
  if (role === 'OWNER') {
    return lockedOwnerPermissions();
  }
  return {
    grants: orderPermissions(ROLE_PERMISSIONS[role].filter(isEditablePermission)),
    branchScope: DEFAULT_BRANCH_SCOPE[role],
  };
}

/** Whether `value` is a plain object we can read keys off. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalise one stored `grants` value.
 *
 * A non-array (absent, `null`, a string left by a bad write) means "never
 * configured" and yields the role's defaults. An array is taken at its word,
 * including an empty one, with unknown or non-editable entries dropped — a
 * capability the editor cannot show must not be silently held.
 */
function normalizeGrants(value: unknown, role: StaffRole): Permission[] {
  if (!Array.isArray(value)) {
    return defaultRolePermissions(role).grants;
  }
  return orderPermissions(value.filter(isEditablePermission));
}

/** Normalise one stored `branchScope`; anything unrecognised falls back to the default. */
function normalizeBranchScope(value: unknown, role: StaffRole): BranchScope {
  const parsed = branchScopeSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BRANCH_SCOPE[role];
}

/**
 * Normalise one role's stored entry — total, never throws.
 *
 * Totality is the point. This blob shares a JSON column with eighteen other
 * sections; if a malformed `permissions` entry could fail the parse, one bad write
 * would take the gym's brand, hours, and payment methods down with it. Garbage in
 * any position degrades to that field's default and no further.
 *
 * OWNER ignores its input entirely — see {@link gymRolePermissionsSettingsSchema}.
 */
function normalizeRolePermissions(value: unknown, role: StaffRole): RolePermissionsSetting {
  if (role === 'OWNER') {
    return lockedOwnerPermissions();
  }
  const stored = isRecord(value) ? value : {};
  return {
    grants: normalizeGrants(stored.grants, role),
    branchScope: normalizeBranchScope(stored.branchScope, role),
  };
}

/** The per-role schema: a total normalisation, so no input can fail this section. */
function rolePermissionsSchema(role: StaffRole): z.ZodType<RolePermissionsSetting, z.ZodTypeDef, unknown> {
  return z.unknown().transform((value) => normalizeRolePermissions(value, role));
}

/**
 * The shape of the stored section, one entry per staff role.
 *
 * `satisfies Record<StaffRole, …>` keeps it exhaustive at compile time the way
 * {@link ROLE_PERMISSIONS} does: adding a staff role fails to build until it is
 * given an entry here, rather than resolving to an empty grant set at runtime.
 * MEMBER is absent on purpose — it is a customer, and every capability it holds is
 * self-service and therefore not editable.
 */
const ROLE_PERMISSIONS_SHAPE = {
  OWNER: rolePermissionsSchema('OWNER'),
  MANAGER: rolePermissionsSchema('MANAGER'),
  RECEPTIONIST: rolePermissionsSchema('RECEPTIONIST'),
  TRAINER: rolePermissionsSchema('TRAINER'),
} satisfies Record<StaffRole, z.ZodType<RolePermissionsSetting, z.ZodTypeDef, unknown>>;

/**
 * The `permissions` section of `Gym.settings` — each staff role's grants and branch
 * scope.
 *
 * **Absent parses to the built-in defaults.** Every field normalises instead of
 * rejecting, so `{}`, `null`, and a half-written override all produce a complete,
 * sensible object. That is why this shipped without a migration: a gym that never
 * opens the editor behaves exactly as it did, because the answer it resolves to IS
 * {@link ROLE_PERMISSIONS}.
 *
 * **OWNER is locked in the schema, not by the callers.** Its entry is a transform
 * that discards whatever it is given and returns every permission over every
 * branch. A blob claiming `OWNER: { grants: [], branchScope: 'assigned' }` — from a
 * malicious PATCH, a bad merge, or a hand-edited row — parses to full access
 * regardless, so the lockout it describes cannot be reached through this schema.
 * There is no code path that reads the section without going through here.
 */
export const gymRolePermissionsSettingsSchema = z.preprocess(
  (value) => (isRecord(value) ? value : {}),
  z.object(ROLE_PERMISSIONS_SHAPE),
);

/** The stored per-role permissions — {@link gymRolePermissionsSettingsSchema}. */
export type GymRolePermissionsSettings = z.infer<typeof gymRolePermissionsSettingsSchema>;

/**
 * The section as a gym that has configured nothing resolves it — every role at its
 * {@link defaultRolePermissions}.
 *
 * Handed to the editor as the "reset to defaults" target, and used as the resolver's
 * fallback when no settings are available at all.
 */
export function defaultGymRolePermissions(): GymRolePermissionsSettings {
  return {
    OWNER: defaultRolePermissions('OWNER'),
    MANAGER: defaultRolePermissions('MANAGER'),
    RECEPTIONIST: defaultRolePermissions('RECEPTIONIST'),
    TRAINER: defaultRolePermissions('TRAINER'),
  };
}

// ---------------------------------------------------------------------------
// The write path
// ---------------------------------------------------------------------------

/** A capability a gym may grant — the closed {@link EDITABLE_PERMISSIONS} vocabulary. */
const editablePermissionSchema = z
  .nativeEnum(Permission)
  .refine(isEditablePermission, 'That capability cannot be assigned to a role');

/**
 * One role's row as the editor submits it: BOTH fields, always.
 *
 * Deliberately not partial. The section is stored and merged per role, so a body
 * carrying only `branchScope` would have to invent a `grants` value — and whichever
 * it invented (the defaults, or the empty set) would silently rewrite grants the
 * operator never touched. The editor holds the whole row on screen; it sends the
 * whole row.
 */
const rolePermissionsUpdateSchema = z
  .object({
    grants: z.array(editablePermissionSchema),
    branchScope: branchScopeSchema,
  })
  .strict();

/**
 * Body for the `permissions` section of `PATCH /gyms/settings` — any subset of the
 * staff roles, each given a complete row.
 *
 * OWNER is accepted and normalised rather than rejected: a client that round-trips
 * the whole matrix should not get a `400` for echoing back the padlocked row it was
 * shown. Whatever it sends resolves to full access, so the lock holds on the way in
 * as well as on the way out.
 */
export const updateGymRolePermissionsSchema = z
  .object({
    OWNER: z
      .unknown()
      .transform(() => lockedOwnerPermissions())
      .optional(),
    MANAGER: rolePermissionsUpdateSchema.optional(),
    RECEPTIONIST: rolePermissionsUpdateSchema.optional(),
    TRAINER: rolePermissionsUpdateSchema.optional(),
  })
  .strict();

/** Validated `permissions` patch — {@link updateGymRolePermissionsSchema}. */
export type UpdateGymRolePermissionsInput = z.infer<typeof updateGymRolePermissionsSchema>;

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** What a role may do at this gym, right now — the output of {@link resolveRolePermissions}. */
export interface ResolvedRolePermissions {
  /** The role name this was resolved for, echoed so a cached entry names its subject. */
  role: string;
  /** Every capability the role holds, in {@link ALL_PERMISSIONS} order. */
  grants: Permission[];
  /** Whether the role works gym-wide or only across its assigned branches. */
  branchScope: BranchScope;
}

/** Whether `role` is one of the four gym staff roles this section stores an entry for. */
function isStaffRole(role: string): role is StaffRole {
  return (staffRoleSchema.options as readonly string[]).includes(role);
}

/**
 * What `role` may do at a gym whose `permissions` section is `settings`.
 *
 * Synchronous, pure, and free of Node built-ins on purpose: the API's
 * `PermissionsGuard`, the console's dashboard layout and the browser context
 * provider all call this, and the moment one of them resolved differently the
 * sidebar would offer a link the server refuses.
 *
 * Pass `settings.permissions`; `null` or `undefined` resolves to the built-in
 * defaults, which is the right answer for a gym with no settings row — NOT for a
 * gym whose settings could not be loaded. A fetch that failed must deny, not call
 * this with `null`.
 *
 * The rules, in order:
 *   • `SUPER_ADMIN` — platform-wide, never gym-scoped: everything, everywhere.
 *   • `OWNER` — the locked system role: everything, everywhere.
 *   • A staff role — its stored (or default) grants, plus the non-editable
 *     capabilities {@link ROLE_PERMISSIONS} gives it, which no override can remove.
 *   • `MEMBER` — the built-in customer grants, gym-wide; there is nothing to edit.
 *   • Anything else — no grants, and `assigned` scope, so an unrecognised role
 *     fails closed on both axes.
 */
export function resolveRolePermissions(
  settings: GymRolePermissionsSettings | null | undefined,
  role: string,
): ResolvedRolePermissions {
  if (role === 'SUPER_ADMIN' || role === 'OWNER') {
    return { role, grants: [...ALL_PERMISSIONS], branchScope: 'all' };
  }

  if (!isStaffRole(role)) {
    const builtIn = (ROLE_PERMISSIONS as Record<string, readonly Permission[]>)[role];
    return builtIn === undefined
      ? { role, grants: [], branchScope: 'assigned' }
      : { role, grants: orderPermissions(builtIn), branchScope: 'all' };
  }

  const stored = settings?.[role] ?? defaultRolePermissions(role);
  const fixed = ROLE_PERMISSIONS[role].filter((permission) => !EDITABLE_SET.has(permission));
  return {
    role,
    grants: orderPermissions([...stored.grants.filter(isEditablePermission), ...fixed]),
    branchScope: stored.branchScope,
  };
}

/**
 * Whether a {@link ResolvedRolePermissions} holds `permission` — the gym-aware
 * counterpart to `roleHasPermission`, for a caller that has already resolved once
 * and is now checking several capabilities against the same answer.
 */
export function resolvedHasPermission(
  resolved: ResolvedRolePermissions,
  permission: Permission,
): boolean {
  return resolved.grants.includes(permission);
}

// ---------------------------------------------------------------------------
// The editor's model of the matrix
// ---------------------------------------------------------------------------

/**
 * The two columns of the editor.
 *
 * Not View / Create / Edit / Delete. Thirty of the thirty-three capabilities are
 * already `read` + `write|manage` pairs and NO resource in this codebase separates
 * create from edit from delete at the authorization layer — `MemberWrite` alone
 * authorizes create, patch, deactivate, trash, restore, notes, email and tasks.
 * Four columns would render four checkboxes writing to two booleans, and a Delete
 * column would be inapplicable on most rows besides: members, trainers, locations,
 * packages, products, class types and plans all deactivate rather than delete.
 */
export const PERMISSION_MATRIX_COLUMNS = ['view', 'manage'] as const;

/** One column of the editor — {@link PERMISSION_MATRIX_COLUMNS}. */
export type PermissionMatrixColumn = (typeof PERMISSION_MATRIX_COLUMNS)[number];

/**
 * Which columns a row actually has, and what each one writes.
 *
 * A discriminated union rather than two optional fields, so a single-column row
 * has no `manage` to read: the UI cannot render a cell that writes nowhere,
 * because there is no value for it to bind to. Three resources are genuinely
 * single-column — `StaffManage` grants reading and writing together, `GymManage`
 * likewise, and `ReportView` has no write action to grant — and per the reference
 * design they render as one wide toggle rather than a checkbox beside a greyed
 * ghost.
 */
export type PermissionMatrixCells =
  | { readonly kind: 'viewManage'; readonly view: Permission; readonly manage: Permission }
  | { readonly kind: 'single'; readonly permission: Permission };

/** A resource the editor shows a row for — the stable id, safe to persist in UI state. */
export type PermissionResource =
  | 'members'
  | 'trainers'
  | 'staff'
  | 'classes'
  | 'reviews'
  | 'billing'
  | 'catalogue'
  | 'packages'
  | 'automation'
  | 'marketing'
  | 'loyalty'
  | 'reports'
  | 'locations'
  | 'gym'
  | 'audit';

/** A section of the editor — one cluster of the console's own navigation. */
export type PermissionSectionId =
  | 'people'
  | 'operations'
  | 'commerce'
  | 'growth'
  | 'insights'
  | 'system';

/** One row of the editor: a resource, how to name it, and which columns it has. */
export interface PermissionMatrixRow {
  /** Stable identifier for the resource this row governs. */
  resource: PermissionResource;
  /** i18n key (under the `admin` namespace) for the row's label. */
  labelKey: string;
  /** English label — the fallback, so the screen is legible before translations land. */
  label: string;
  /**
   * The console routes this row governs, for the "what does this affect" hint and
   * for the route gate to key off. Empty where the capability guards API surface
   * with no console screen yet (review moderation, loyalty, the audit log).
   */
  hrefs: readonly string[];
  /** What this row's checkboxes write — one column or two. */
  cells: PermissionMatrixCells;
}

/** A labelled group of {@link PermissionMatrixRow}s, rendered as one block. */
export interface PermissionMatrixSection {
  /** Stable identifier for the section. */
  section: PermissionSectionId;
  /** i18n key — the sidebar's own group heading, reused verbatim. */
  labelKey: string;
  /** English heading — the fallback, matching {@link PermissionMatrixRow.label}. */
  label: string;
  rows: readonly PermissionMatrixRow[];
}

/**
 * The editor, top to bottom.
 *
 * The sections and their order are the console's own `NAV_GROUPS`, and the rows are
 * its `NAV_ITEMS`, so an operator reads this screen in the shape of the sidebar
 * they navigate every day rather than in the shape of the permission enum. The
 * labelKeys are the nav's, reused rather than reinvented.
 *
 * Three places where a row is NOT one nav item, each because two links share one
 * capability and two checkboxes writing one boolean is a lie:
 *
 *   • `catalogue` covers Shop, Services and the till — all three are `ProductRead`.
 *   • `reports` covers the Dashboard as well as Reports — both are `ReportView`,
 *     which is also why the nav's `overview` group has no section of its own here.
 *   • `gym` covers Settings and the Member portal — both are `GymManage`.
 *
 * Four rows have no nav item at all. Locations and Packages are real console
 * screens reached from within others; review moderation, loyalty and the audit log
 * are API surface whose console screens do not exist yet. They are listed because
 * the capability is real and revocable — a permission with no row would be one a
 * gym can never take away.
 */
export const PERMISSION_MATRIX_SECTIONS: readonly PermissionMatrixSection[] = [
  {
    section: 'people',
    labelKey: 'navGroups.people',
    label: 'People',
    rows: [
      {
        resource: 'members',
        labelKey: 'nav.members',
        label: 'Members',
        hrefs: ['/members'],
        cells: { kind: 'viewManage', view: Permission.MemberRead, manage: Permission.MemberWrite },
      },
      {
        resource: 'trainers',
        labelKey: 'nav.trainers',
        label: 'Trainers',
        hrefs: ['/trainers'],
        cells: {
          kind: 'viewManage',
          view: Permission.TrainerRead,
          manage: Permission.TrainerWrite,
        },
      },
      {
        // One column: `StaffManage` opens the roster and re-roles people with the
        // same grant. There is no `staff:read` to withhold.
        resource: 'staff',
        labelKey: 'nav.staff',
        label: 'Staff',
        hrefs: ['/staff'],
        cells: { kind: 'single', permission: Permission.StaffManage },
      },
    ],
  },
  {
    section: 'operations',
    labelKey: 'navGroups.operations',
    label: 'Operations',
    rows: [
      {
        resource: 'classes',
        labelKey: 'nav.classes',
        label: 'Classes & schedule',
        hrefs: ['/classes'],
        cells: { kind: 'viewManage', view: Permission.ClassRead, manage: Permission.ClassWrite },
      },
      {
        // One column: moderation is the only staff-side review capability —
        // `ReviewWrite` is a member posting their own, and is self-service.
        resource: 'reviews',
        labelKey: 'permissions.resources.reviews',
        label: 'Review moderation',
        hrefs: [],
        cells: { kind: 'single', permission: Permission.ReviewModerate },
      },
    ],
  },
  {
    section: 'commerce',
    labelKey: 'navGroups.commerce',
    label: 'Commerce',
    rows: [
      {
        resource: 'billing',
        labelKey: 'nav.billing',
        label: 'Billing & invoices',
        hrefs: ['/payments'],
        cells: {
          kind: 'viewManage',
          view: Permission.BillingRead,
          manage: Permission.BillingManage,
        },
      },
      {
        resource: 'catalogue',
        labelKey: 'permissions.resources.catalogue',
        label: 'Shop, services & till',
        hrefs: ['/shop', '/services', '/pos'],
        cells: {
          kind: 'viewManage',
          view: Permission.ProductRead,
          manage: Permission.ProductWrite,
        },
      },
      {
        resource: 'packages',
        labelKey: 'permissions.resources.packages',
        label: 'Package plans',
        hrefs: ['/packages'],
        cells: {
          kind: 'viewManage',
          view: Permission.PackageRead,
          manage: Permission.PackageWrite,
        },
      },
    ],
  },
  {
    section: 'growth',
    labelKey: 'navGroups.growth',
    label: 'Growth',
    rows: [
      {
        resource: 'automation',
        labelKey: 'nav.automation',
        label: 'Automation',
        hrefs: ['/automation'],
        cells: {
          kind: 'viewManage',
          view: Permission.AutomationRead,
          manage: Permission.AutomationManage,
        },
      },
      {
        resource: 'marketing',
        labelKey: 'nav.marketing',
        label: 'Marketing',
        hrefs: ['/marketing'],
        cells: {
          kind: 'viewManage',
          view: Permission.MarketingRead,
          manage: Permission.MarketingManage,
        },
      },
      {
        resource: 'loyalty',
        labelKey: 'permissions.resources.loyalty',
        label: 'Loyalty',
        hrefs: [],
        cells: {
          kind: 'viewManage',
          view: Permission.LoyaltyRead,
          manage: Permission.LoyaltyManage,
        },
      },
    ],
  },
  {
    section: 'insights',
    labelKey: 'navGroups.insights',
    label: 'Insights',
    rows: [
      {
        // One column, and one row for two destinations: `ReportView` opens both
        // the dashboard and the reports hub, and no write action against a report
        // exists to grant.
        resource: 'reports',
        labelKey: 'permissions.resources.reports',
        label: 'Reports & dashboard',
        hrefs: ['/', '/reports'],
        cells: { kind: 'single', permission: Permission.ReportView },
      },
    ],
  },
  {
    section: 'system',
    labelKey: 'navGroups.system',
    label: 'System',
    rows: [
      {
        resource: 'locations',
        labelKey: 'permissions.resources.locations',
        label: 'Branches',
        hrefs: ['/locations'],
        cells: {
          kind: 'viewManage',
          view: Permission.LocationRead,
          manage: Permission.LocationWrite,
        },
      },
      {
        // One column, two destinations: `GymManage` is the single gate on gym
        // configuration and on the member portal's look.
        resource: 'gym',
        labelKey: 'permissions.resources.gym',
        label: 'Gym settings & member portal',
        hrefs: ['/settings', '/member-portal'],
        cells: { kind: 'single', permission: Permission.GymManage },
      },
      {
        // One column: reading the log is the whole capability — nobody writes to
        // an audit trail.
        resource: 'audit',
        labelKey: 'permissions.resources.audit',
        label: 'Audit log',
        hrefs: [],
        cells: { kind: 'single', permission: Permission.AuditRead },
      },
    ],
  },
];

/** Every row of the editor, flattened, in display order. */
export const PERMISSION_MATRIX_ROWS: readonly PermissionMatrixRow[] =
  PERMISSION_MATRIX_SECTIONS.flatMap((section) => section.rows);

/**
 * The capabilities one row's cells write — one for a single-column row, two for a
 * View/Manage pair. The exhaustive switch is what makes adding a third column shape
 * a compile error here rather than a missing checkbox on screen.
 */
export function permissionMatrixRowPermissions(row: PermissionMatrixRow): Permission[] {
  switch (row.cells.kind) {
    case 'single':
      return [row.cells.permission];
    case 'viewManage':
      return [row.cells.view, row.cells.manage];
  }
}
