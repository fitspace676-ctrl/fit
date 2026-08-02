-- Give a class template an explicit start time.
--
-- Until now the time each occurrence started was smuggled in as validFrom's
-- time-of-day: the generator sets dtstart = validFrom, so occurrences inherit
-- whatever clock time that DateTime happened to carry. The seed wrote full
-- instants (07:00Z) and got sensible classes; the admin console's form collects
-- a date only, so every class created through the UI started at 00:00 UTC.
--
-- One field was answering two questions. validFrom now means only "from which
-- date is this template live", and startTime means "at what time does the class
-- start", read in the gym's own timezone.

ALTER TABLE "class_templates" ADD COLUMN "startTime" TEXT NOT NULL DEFAULT '09:00';

-- Backfill from the old anchor so no existing template changes when it runs.
-- validFrom is a UTC instant; the time staff meant is that instant read in the
-- gym's own zone, which is where the new column's value lives. Gyms that never
-- saved settings fall back to the platform default, matching @fit/types.
UPDATE "class_templates" AS t
SET "startTime" = to_char(
      -- validFrom is `timestamp` (no zone). The first cast says "read this naive
      -- value as UTC", the second converts that instant into the gym's local
      -- wall clock — which is what the new column stores. A single cast would
      -- reinterpret rather than convert, leaving the UTC digits unchanged.
      (t."validFrom" AT TIME ZONE 'UTC')
        AT TIME ZONE COALESCE(g."settings" -> 'locale' ->> 'timezone', 'Asia/Tbilisi'),
      'HH24:MI'
    )
FROM "gyms" AS g
WHERE g."id" = t."gymId";
