-- Performance pass (T9.9): back the admin member roster at scale.
--
-- The staff console lists a gym's MEMBER-role memberships filtered by `status`,
-- sorted by `joinedAt`, and paginated, and renders per-status tab counts. With
-- only the single-column ("gymId") index, Postgres filtered `role`/`status` and
-- sorted `joinedAt` in memory over every membership in the gym — O(gym size) per
-- request, which is where the <300ms-at-10k-members budget slipped.
--
-- These composites serve the filter+sort+page and the status groupBy directly
-- from an index. Both are "gymId"-prefixed, so by leftmost-prefix they also cover
-- the plain tenant-scoped ("gymId") lookups the dropped single-column index served.

-- DropIndex
DROP INDEX "gym_members_gymId_idx";

-- CreateIndex
CREATE INDEX "gym_members_gymId_role_status_idx" ON "gym_members"("gymId", "role", "status");

-- CreateIndex
CREATE INDEX "gym_members_gymId_role_joinedAt_idx" ON "gym_members"("gymId", "role", "joinedAt");
