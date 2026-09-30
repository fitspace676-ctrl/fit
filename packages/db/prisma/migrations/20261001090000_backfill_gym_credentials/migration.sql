-- Repair memberships created without a credential after the per-gym rollout.
-- Do not import a platform/other-gym password or verification into a new gym.
-- Existing credentials are preserved; a missing one can be activated or reset.
INSERT INTO "gym_credentials" ("id", "userId", "gymId", "passwordHash", "emailVerifiedAt", "name", "phone", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       m."userId",
       m."gymId",
       NULL,
       NULL,
       u."name",
       u."phone",
       NOW(),
       NOW()
FROM "gym_members" m
JOIN "users" u ON u."id" = m."userId"
ON CONFLICT ("userId", "gymId") DO NOTHING;
