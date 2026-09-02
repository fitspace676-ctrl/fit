# Roles & permissions matrix (2026-09-01)

The owner wrote the roles policy for the console (Owner / Manager /
Receptionist / Trainer). This plan turns it into the `@fit/types` matrix, the
API decorators, and the admin gates. Roles stay fixed (no custom roles yet);
`packages/types/src/permissions.ts` is the single source of truth.

## Policy summary

| Role         | Summary                                                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OWNER        | Full system access and control (every permission).                                                                                                                                                                                                                        |
| MANAGER      | Owner minus: gym settings, location add/deactivate, roles & permissions management, FormaCore subscription, ownership (cannot create / promote / edit OWNER accounts).                                                                                                    |
| RECEPTIONIST | Front desk: members, memberships (sell/renew/freeze/resume/cancel), POS (payments, discounts, transactions; **no refunds**), view stock (no adjustments), bookings, attendance, waitlists, PT bookings, PT package sales, check-ins. No reports, no revenue, no settings. |
| TRAINER      | Training only: member training profiles, everyone's class/PT calendar, own classes / PT sessions, workout plans, own & other trainers' schedules. No POS, no products, no money, no reports, no staff.                                                                    |
| MEMBER       | Self-service only (book, review, own subscription, own credits).                                                                                                                                                                                                          |

Account capabilities (`profile:manage`, `notification:manage`) are held by every
signed-in user and are not part of any role's list.

## What changed

1. `packages/types/src/permissions.ts` - enum grows from 33 to 71 permissions
   (the owner's "add to the model" list plus the splits needed to draw the lines
   above: `location:manage`, `staff:read`, `roles:read`, `booking:manage`,
   `pt-package:read|sell`, `member-checkin:read`, `*:manage-own`).
   `ROLE_PERMISSIONS` rewritten; `ACCOUNT_PERMISSIONS` introduced;
   `roleHasPermission` implies account permissions for every known role.
2. `packages/i18n` - en + ka labels for every new permission, role descriptions
   rewritten to match the policy.
3. API - decorators remapped where a handler now has a finer permission
   (POS, inventory, check-in, attendance, waitlist, bookings, PT, staff
   schedules, trainer availability, location add/deactivate, report export,
   revenue, enrolment, freeze, credit packs). Service rules:
   - `staff.service` - a non-OWNER caller cannot assign the OWNER role, re-role
     an OWNER, or remove an OWNER (`403 OWNER_ROLE_RESTRICTED`); changing
     `assignedLocationIds` needs `staff:assign-location`.
   - `admin-products` - a `RECOUNT` stock adjustment needs `stocktake:perform`;
     sending `priceAmount` / `costAmount` needs `product:pricing`.
   - `orders` - a `promoCode` on a POS sale needs `discount:apply`.
4. Admin - server actions, pages, nav, and `ROUTE_PERMISSIONS` remapped to the
   same permissions; `/staff` opens to MANAGER; the OWNER role is only offered
   in the invite / re-role menus to an OWNER.

## Deliberately out of scope (next phases)

- **Assigned locations.** `GymMember.assignedLocationIds` exists but no query
  filters on it. Location scoping is data scoping, not a permission, and needs
  its own pass through every list/detail service.
- **Own-only for trainers.** No handler checks resource ownership yet. The
  matrix grants `class:manage-own` / `pt-session:manage-own` to TRAINER; the
  handlers keep requiring the full permission until ownership-aware paths exist,
  so a trainer is denied (fail closed), which matches today's behaviour.
- **Refund authorisation.** A receptionist has no `payment:refund`; a
  manager-approval flow at the till is a separate feature.
- **Custom roles.** `roles:manage` is reserved for it.
