-- Stage 2 of multi-branch: a member gets a HOME BRANCH.
--
-- `gym_members` is the model that gates the most: subscriptions, invoices,
-- loyalty, retention and most dashboard KPIs all count members or something a
-- member owns. Until this column exists, "members at branch X", per-branch churn,
-- MRR and ARPM are not slow queries — they are unanswerable, which is why the
-- roadmap's exemption register lists a dozen surfaces as gym-wide "unblocked by
-- Stage 2".
--
-- This is the customer-side home branch — where they signed up and normally
-- train. It is NOT `assignedLocationIds`, the loose staff work-assignment array
-- that already sits on this table; that one says which branches a receptionist is
-- rostered to work at. Same table, two unrelated ideas about locations.
--
-- Follows 20260830120000_location_default_branch_backfill exactly, including its
-- expand/contract stance: the column stays NULLABLE here. Tightening it to NOT
-- NULL waits for a follow-up migration, once every member-create path (console
-- form, self-signup, invite, import) requires a branch and no new nulls can
-- appear. That earlier migration already guaranteed every gym has exactly one
-- `isDefault` branch — creating a "Main" one for gyms that had none — so the
-- backfill below always has somewhere to point.
--
-- Statement order is deliberate and not Prisma's default draft order: the data is
-- settled before the constraint that polices it, so the foreign key is added to a
-- column whose every value is already a real location of the right gym.

-- AlterTable
ALTER TABLE "gym_members" ADD COLUMN     "locationId" TEXT;

-- ---------------------------------------------------------------------------
-- 1. Backfill every membership onto its gym's default branch.
--
--    `IS NULL` keeps the statement re-runnable: a row that already has a home
--    branch is never dragged back to the default. The join on `d."gymId" =
--    m."gymId"` is what makes cross-tenant attribution impossible — a member can
--    only ever land on a branch of their own gym.
--
--    Every membership row, not only the MEMBER-role ones. A staff row's home
--    branch is simply the branch they are based at, and leaving staff null would
--    half-populate the column the NOT NULL follow-up has to tighten.
--
--    Soft-deleted (trashed) memberships are included for the same reason: they
--    can be restored, and a restored member with no branch would reappear missing
--    from every per-branch count.
--
--    `updatedAt` is deliberately NOT touched — this is a system backfill, not an
--    edit anybody made, and every member showing as "just modified" would be a lie
--    in the console's audit column.
-- ---------------------------------------------------------------------------
UPDATE "gym_members" m
SET "locationId" = d."id"
FROM "locations" d
WHERE d."gymId" = m."gymId"
  AND d."isDefault"
  AND m."locationId" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. The branch-filter index.
--
--    `gymId` leads because the tenant Prisma extension always injects it into the
--    `where` — a `locationId`-first index is a shape no query in this codebase can
--    issue. `status` trails so the roster's filter+count ("ACTIVE members at this
--    branch", and the per-status tab counts) is served straight from the index.
--
--    This ADDS to `(gymId, role, status)` rather than replacing it: that index's
--    second column is `role`, so neither is a prefix of the other and the
--    unfiltered roster still needs its own.
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX "gym_members_gymId_locationId_status_idx" ON "gym_members"("gymId", "locationId", "status");

-- ---------------------------------------------------------------------------
-- 3. The foreign key.
--
--    ON DELETE SET NULL, never CASCADE: closing a branch must not delete the
--    people who trained there. They fall back to unattributed and wait to be
--    re-homed. A member missing from one report is a gap; a member deleted with
--    their branch is a lost customer and a lost payment history.
-- ---------------------------------------------------------------------------

-- AddForeignKey
ALTER TABLE "gym_members" ADD CONSTRAINT "gym_members_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
