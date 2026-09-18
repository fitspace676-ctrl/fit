# Per-gym credentials (T1.25) — plan

Branch `feat/per-gym-credentials`, base `origin/main` (`ac59b682`). Research:
`docs/superpowers/research/2026-09-17-per-gym-credentials-research.md`.

## 1. Schema

New model `GymCredential` → table `gym_credentials`:

| column | type | note |
|---|---|---|
| `id` | text pk (cuid) | |
| `userId` | text → `users.id` cascade | the identity |
| `gymId` | text → `gyms.id` cascade | the gym this password opens |
| `passwordHash` | text? | null for social-only / not-yet-activated |
| `emailVerifiedAt` | timestamp? | verified **for this gym** |
| `name` | text? | per-gym display name |
| `phone` | text? | per-gym phone |
| `createdAt`, `updatedAt` | | |

`@@unique([userId, gymId])`, `@@index([gymId])`. Listed in `TENANT_SCOPED_MODELS`
(auth runs on the unscoped `PrismaService`, like `registerGym` already does).

`User` keeps `passwordHash`, `emailVerifiedAt`, `name`, `phone` untouched. It is
still what a **platform** account (super-admin, a bare `/auth/register` account
with no gym) signs in with; a second PR drops it once every reader has moved.

## 2. Migration `20260917120000_gym_credentials` (additive, idempotent)

1. `CREATE TABLE gym_credentials` + unique + index + FKs.
2. Backfill — one credential per existing membership (any status, incl. trashed),
   copying the user's current password/verified/name/phone:

```sql
INSERT INTO "gym_credentials" ("id","userId","gymId","passwordHash","emailVerifiedAt","name","phone","createdAt","updatedAt")
SELECT gen_random_uuid()::text, m."userId", m."gymId", u."passwordHash", u."emailVerifiedAt", u."name", u."phone", NOW(), NOW()
FROM "gym_members" m JOIN "users" u ON u."id" = m."userId"
ON CONFLICT ("userId","gymId") DO NOTHING;
```

Runs automatically on Railway (`prisma migrate deploy && node …`). Re-running is
a no-op (`ON CONFLICT DO NOTHING`). Rollback: `DROP TABLE gym_credentials` — the
`users` columns are untouched, so the previous build keeps working.

## 3. Tokens (Redis)

`email-verify:<t>` / `password-reset:<t>` values become JSON
`{"userId","gymId"|null}`. A plain-string value (minted before deploy, ≤24h TTL)
is read as `{userId, gymId: null}` = legacy whole-identity token.

## 4. Scenarios — now → after

| flow | now | after |
|---|---|---|
| `POST /auth/signup` gym B, email exists (member of A only) | 409 EMAIL_TAKEN | normal signup: reuse `User`, new `GymMember` + `GymCredential(B)` with its own password, verify mail for B. Same 201 as a new email (no enumeration). Already a member of B → 409 ALREADY_MEMBER (unchanged). |
| `POST /auth/register-gym` owner email exists | 409 EMAIL_TAKEN | reuse `User`; new gym + OWNER membership + credential (password from body or null) + activation mail on the new gym's host. |
| `POST /auth/activate` | sets `User.passwordHash` | token names the gym; host must be that gym (403 TENANT_MISMATCH); sets **that credential's** password + verified; revokes that gym's refresh tokens. |
| `GET /auth/verify` | stamps `User.emailVerifiedAt` | stamps the token's credential (and `User` if never set); session on that gym. Legacy token → all of the user's credentials. |
| staff invite, existing email | login with old password redeems | `accept-invite` sends to **register** when no credential exists on the inviting gym; register with an existing email + valid invite creates the gym-B credential with the **new** password (no 409). Login with invite still upgrades a member who already has a credential there. |
| `POST /auth/login` on `<slug>` host | `User.passwordHash` | that gym's credential only. No credential there → 401 (constant-time dummy verify). Unverified there → 403 EMAIL_NOT_VERIFIED. MEMBERSHIP_NOT_ACTIVE / GYM_SUSPENDED unchanged. |
| `POST /auth/login` tenant-less (mobile, `app.<root>`) | primary gym | super-admin → `User.passwordHash`, tenant-less session. Else verify the password against every credential in an active gym: 0 credentials → `User.passwordHash` fallback (platform account); exactly 1 match → that gym; >1 match → **409 GYM_SELECTION_REQUIRED** `{ gyms: [{slug,name}] }` (only gyms the password unlocked — no enumeration); client re-submits with `gymSlug`. |
| `POST /auth/refresh` | pinned gym | unchanged (no password on refresh). |
| `POST /auth/forgot-password` | any account | host gym (or body `gymSlug`) → token for that credential, link on that host. Tenant-less: 1 credential → it; several → legacy whole-identity token (link on platform page). Response always generic. |
| `POST /auth/reset-password` | `User.passwordHash`, revoke all | token's credential only; revokes that gym's sessions; session only when host = token gym (else `sessionIssued:false`). Legacy token → every credential + `User`. |
| Google / Apple | identity on `User` | unchanged identity; after scope resolves, a credential for the session's gym is ensured (verified, no password). #340 NOT_A_MEMBER kept. |
| super-admin | `User.passwordHash` | unchanged (`isSuperAdmin` short-circuits to the platform credential). |
| impersonation | scoped JWT | untouched. |
| staff console name/phone edit | writes `User` | writes `User` **and** that gym's credential. Reads still come from `User.name` (follow-up PR). |
| mobile | slug from deep link / env / last login, else none | same, plus a gym picker on 409 GYM_SELECTION_REQUIRED; forgot-password sends the resolved slug. |

## 5. Code touched

- `packages/db/prisma/schema.prisma`, migration, `seed.ts` (credential upserts).
- `packages/types/src/auth.ts`: `GYM_SELECTION_REQUIRED_CODE`, `GymSelectionRequiredResponse`, `forgotPasswordSchema.gymSlug`.
- `apps/api/src/auth/auth.service.ts` (every flow above), `auth.controller.ts` (login/forgot take the host slug), `token.service.ts` (`revokeAllForUser(userId, gymId?)`), `prisma-tenant.extension.ts`, `members.service.ts` (`updateMember`), `test/integration-db.ts`.
- `apps/mobile`: `lib/api/auth.ts`, `lib/auth/session.ts`, `app/(auth)/login.tsx` (picker), catalogue keys.
- `apps/web/lib/auth.ts` + `credentials-login-form.tsx` (picker on `app.<root>`), i18n keys.
- `apps/e2e/fixtures.ts` (credential rows), e2e cases.

## 6. Tests

- unit: `auth.service.spec.ts` (signup/registerGym/invite on an existing email, host login, tenant-less selection, verify/reset per gym, social ensures credential, super-admin), `token.service.spec.ts`.
- integration: `per-gym-credentials.int-spec.ts` — one email, two gyms, two passwords; reset on A leaves B; invite + registerGym on an existing email; tenant-less login picker; backfill shape.
- e2e: same-email-two-gyms and reset isolation in `member-tenant-isolation.spec.ts`.
- local: `prisma migrate deploy` on the seeded DB, then `SELECT count(*)` credentials == memberships.

## 7. Risks

- Tenant-less login costs N argon2 verifies for an N-gym user (2 users on prod).
- A tenant-less reset for a multi-gym user still resets every gym (legacy token) — the mobile app sends its last gym slug, so this only hits `app.<root>` users of several gyms.
- Password login on a gym you belong to but hold no credential in (only possible for memberships created after deploy without a credential — none of the write paths do that) answers 401, not NOT_A_MEMBER.
- `User.name`/`phone` are still what the rosters read; per-gym values are written but not yet shown.
- `gyms.service.spec.ts` may conflict with the portal-colour PR (its PR merges first).
