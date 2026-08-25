-- Personal-training services created before the name followed the gym language
-- carry "Personal training — <trainer>" (English, em dash). Rewrite the prefix
-- the way the API now generates it: the gym's own language and a plain hyphen.
-- The trainer part of the name is kept verbatim.
UPDATE "services" AS s
SET "name" = (
  CASE COALESCE(g."settings" -> 'locale' ->> 'language', 'en')
    WHEN 'ka' THEN 'პერსონალური ვარჯიში - '
    WHEN 'ru' THEN 'Персональная тренировка - '
    ELSE 'Personal training - '
  END
) || substring(s."name" FROM '^Personal training — (.*)$')
FROM "gyms" AS g
WHERE g."id" = s."gymId"
  AND s."type" = 'PERSONAL_TRAINING'
  AND s."name" LIKE 'Personal training — %';
