-- A service no longer carries a recurrence schedule: it never produced a
-- bookable slot (slots are opened one by one on the PT calendar), so the owner
-- had the whole section removed on 2026-09-02.
ALTER TABLE "services" DROP COLUMN "schedule";

-- The generated personal-training service name changed from "Personal
-- training" to "Personal session" (and its Georgian / Russian forms) on the
-- same day. Existing services are renamed so the catalogue reads one way.
UPDATE "services"
SET "name" = 'Personal session - ' || substring("name" from length('Personal training - ') + 1)
WHERE "type" = 'PERSONAL_TRAINING' AND "name" LIKE 'Personal training - %';

UPDATE "services"
SET "name" = 'პერსონალური სესია - ' || substring("name" from length('პერსონალური ვარჯიში - ') + 1)
WHERE "type" = 'PERSONAL_TRAINING' AND "name" LIKE 'პერსონალური ვარჯიში - %';

UPDATE "services"
SET "name" = 'Персональная сессия - ' || substring("name" from length('Персональная тренировка - ') + 1)
WHERE "type" = 'PERSONAL_TRAINING' AND "name" LIKE 'Персональная тренировка - %';
