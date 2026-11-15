-- Short invoice references by default: INV-01, INV-02 … INV-99, INV-100, one
-- gym-wide count that never restarts (format `prefix-number`, from 1).
--
-- The new defaults reach every gym that never stored invoice settings. A gym
-- that saved ANY settings has the old defaults written into its blob
-- (`INV` / `prefix-year-number` / 1000), because the settings form sends the
-- whole invoice section on every save. Those are moved to the new policy here.
-- A gym that chose something else (another prefix, format or start) keeps it.
--
-- Invoices already issued keep their numbers: references are stored on each
-- invoice row, and the new shape cannot collide with the old one (`INV-01` is
-- not `INV-2026-1000`). The year-less shape draws from its own counter bucket
-- (year 0), which starts at 1.
--
-- That bucket may already hold a count, from a time the gym used the year-less
-- shape (it never moves backwards). It is cleared, so the run starts at INV-01,
-- ONLY when the gym has issued no `INV-<n>` reference: otherwise a restart would
-- reach a number it already used and the unique (gymId, number) index would
-- refuse the invoice. Such a gym continues after its highest existing number.
DELETE FROM "invoice_sequences" s
USING "gyms" g
WHERE s."gymId" = g."id"
  AND s."year" = 0
  AND g."settings" IS NOT NULL
  AND g."settings"::jsonb -> 'invoice' ->> 'format' = 'prefix-year-number'
  AND g."settings"::jsonb -> 'invoice' ->> 'prefix' = 'INV'
  AND g."settings"::jsonb -> 'invoice' ->> 'startNumber' = '1000'
  AND NOT EXISTS (
    SELECT 1 FROM "invoices" i
    WHERE i."gymId" = g."id" AND i."number" ~ '^INV-[0-9]+$'
  );

UPDATE "gyms"
SET "settings" = jsonb_set(
      jsonb_set("settings"::jsonb, '{invoice,format}', '"prefix-number"'),
      '{invoice,startNumber}', '1'
    )
WHERE "settings" IS NOT NULL
  AND "settings"::jsonb -> 'invoice' ->> 'format' = 'prefix-year-number'
  AND "settings"::jsonb -> 'invoice' ->> 'prefix' = 'INV'
  AND "settings"::jsonb -> 'invoice' ->> 'startNumber' = '1000';
