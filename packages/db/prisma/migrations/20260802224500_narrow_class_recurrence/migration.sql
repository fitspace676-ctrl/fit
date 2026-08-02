-- The class-template editor now offers one choice — daily or weekly, plus the
-- weekdays a weekly class runs on. Three controls went with that narrowing:
-- the Monthly frequency, the every-N interval, and the "Ends" radios
-- (never / after N occurrences / on date). How long a series runs is the
-- template's own validFrom/validUntil window, which the form already collects
-- under a field labelled "Ends".
--
-- A stored rule carrying FREQ=MONTHLY, INTERVAL>1, COUNT or UNTIL no longer
-- parses in the editor. Left alone it would render an empty recurrence and let
-- staff save a rule wider than the one on file, so rewrite those rows here.

-- Monthly has no daily-or-weekly equivalent. Weekly is the closest cadence the
-- editor can still express; this is a rewrite, not a translation — a monthly
-- class becomes a weekly one and will run roughly four times as often. Weekday
-- is left to the rule's own anchor, validFrom, as RFC-5545 defaults it.
UPDATE "class_templates"
SET "rrule" = 'FREQ=WEEKLY'
WHERE "rrule" LIKE 'FREQ=MONTHLY%'
   OR "rrule" LIKE 'RRULE:FREQ=MONTHLY%';

-- Drop the retired clauses, keeping FREQ and BYDAY, which the editor still
-- models. Two consequences worth stating plainly:
--   • INTERVAL>1 collapses to 1, so an every-3-weeks class becomes weekly.
--   • A series that ended via COUNT/UNTIL is now bounded only by its validity
--     window, so a template relying on COUNT alone becomes open-ended — set
--     validUntil on those if the cut-off still matters.
UPDATE "class_templates"
SET "rrule" = regexp_replace("rrule", ';(INTERVAL|COUNT|UNTIL)=[^;]*', '', 'g')
WHERE "rrule" ~ ';(INTERVAL|COUNT|UNTIL)=';
