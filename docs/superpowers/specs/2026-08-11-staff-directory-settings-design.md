# Settings → Staff: what the staff page shows

## Problem

Every gym gets the same staff page. A two-person studio sees the same roster
chrome as a multi-branch operator, and neither can change it.

Three concrete symptoms:

- The roster shows First name, Last name, Role and Status. `StaffMember` also
  carries `email`, `phone`, `joinedAt` and `locations`
  (`packages/types/src/staff.ts:92`) — none of which any gym can surface.
- Four finished panels — `notes-panel`, `schedule-panel`, `tasks-panel`,
  `timeoff-panel` — are never imported. Their server actions all exist
  (`staff/depth-actions.ts`), and their tab labels are already translated
  (`admin.staff.depth.*`). They are complete features nobody can reach.
- "Who's Working Now" and the "Roles & Permissions" tab are unconditional, and a
  gym that doesn't roster shifts has no way to drop the card.

Settings → Membership already solves this shape of problem for the add-member
form. This applies the same pattern to the staff page.

## Scope

**In scope:** which columns the staff roster shows, and which blocks the staff
page renders.

**Out of scope:** the Add-Staff drawer's fields. It collects five things, most of
them mandatory (name, role), so there is little to configure. It can get its own
section later if a gym asks.

## Semantics

A toggle that is **on** shows the column or block; **off** hides it. Unlike
`memberIntake`, nothing here is made mandatory — these are display choices, not
data-collection policy.

Defaults reproduce today's page exactly, so a gym that never opens Settings sees
no change:

### Columns

| Key                                    | Default | Today                             |
| -------------------------------------- | ------- | --------------------------------- |
| `lastName`, `role`, `status`           | on      | shown                             |
| `location`, `email`, `phone`, `joined` | off     | not shown, though the data exists |

First name has no toggle. It is the row's identity and its click target — a
roster of anonymous rows is not a leaner roster, it is a broken one.

### Page sections

| Key                                     | Default | Today                   |
| --------------------------------------- | ------- | ----------------------- |
| `whosWorking`, `roles`                  | on      | shown                   |
| `schedule`, `timeOff`, `tasks`, `notes` | off     | built but never mounted |

The four off-by-default sections are existing components being connected, not new
features. They stay off because switching them on changes a gym's page without
anyone asking for it.

## Design

### 1. Schema

`gymStaffDirectorySettingsSchema` beside `gymMemberIntakeSettingsSchema` in
`packages/types/src/gym-settings.ts` — a flat object of thirteen booleans, wired
through the same three places every other section uses: `gymSettingsStoredSchema`,
the `GymSettings` response type, and `updateGymSettingsSchema`'s
`.partial().strict()` patch entry.

Flat rather than nested (`{columns: …, sections: …}`) because the patch path
merges one level deep. A nested shape would need its own partial/strict handling
at each level for no gain — the Settings screen groups the keys for display, which
is where the grouping belongs.

Two exported key lists, `STAFF_COLUMN_FIELDS` and `STAFF_SECTION_FIELDS`, give the
Settings screen its two groups and the staff page its iteration order, so the
grouping is stated once.

### 2. Settings screen

A new **Staff** nav item between Membership and Payment methods, rendering two
cards — "Columns" and "Page sections" — of the same `Switch` rows Membership uses.
Reuses the existing `settings-form.tsx` machinery: the field-key union, the
error-to-tab mapping, and the defaults/patch plumbing.

### 3. Staff page

- `staff/page.tsx` fetches the gym's settings alongside the roster, falling back
  to schema defaults if that call fails, so a settings outage never blanks the
  page. The time-off rows are fetched **only** when `timeOff` is on — an off
  section costs nothing.
- `staff-console.tsx` gates the "Who's Working Now" card, builds its tab list from
  the config, and mounts the four panels. Three share the prop shape
  `{staff, selectedStaffId, onSelectStaff}`; `TimeOffPanel` takes the fetched
  `initialRequests`.
- `staff-table.tsx` builds its column array from the config and gains cells for
  the four previously unshown fields.

### 4. Edge cases

- **Every section off** — the tab strip is not rendered at all and the roster
  stands alone, rather than leaving an empty one-tab bar.
- **The active tab is switched off** — the console falls back to the staff list
  instead of rendering a tab that no longer exists.
- **Every optional column off** — the table is exactly today's four columns.
- **A staff member with no locations / phone** — the cell shows the roster's
  existing em dash, matching how the surname cell already handles a blank.

## Testing

- `packages/types/src/gym-settings.spec.ts` — defaults reproduce today's page;
  the two key lists cover the schema exactly (so a new toggle cannot be added
  without appearing in the UI); a partial update round-trips and rejects unknown
  keys.
- `staff-table` — the column set follows the config, and an all-off config leaves
  the default columns.
- `settings-i18n.spec.ts` already guards en/ka key parity for the settings screen.
