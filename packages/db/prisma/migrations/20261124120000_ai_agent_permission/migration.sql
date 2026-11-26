-- The console's AI assistant got its own capability, `ai-agent:use`: owners and
-- managers hold it by default, the front desk and coaches do not.
--
-- A gym that has already saved its roles matrix stores the MANAGER grants as an
-- explicit list, which predates the capability. Without this, every such gym's
-- managers would silently lose the assistant. Append it once to stored MANAGER
-- grants that lack it; RECEPTIONIST and TRAINER lists are left as they are (no
-- access is the intended default), and OWNER is locked to every permission.
UPDATE "gyms"
SET "settings" = jsonb_set(
  "settings"::jsonb,
  '{permissions,MANAGER,grants}',
  ("settings"::jsonb -> 'permissions' -> 'MANAGER' -> 'grants') || '["ai-agent:use"]'::jsonb
)
WHERE jsonb_typeof("settings"::jsonb -> 'permissions' -> 'MANAGER' -> 'grants') = 'array'
  AND NOT (("settings"::jsonb -> 'permissions' -> 'MANAGER' -> 'grants') @> '["ai-agent:use"]'::jsonb);
