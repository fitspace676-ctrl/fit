-- Sign-in by phone number looks an account up by the last nine digits of the
-- number on it (`phoneLoginKey` in @fit/types; the query is in
-- AuthService.findAccountsByPhone). Numbers are stored as typed, so the key is
-- an expression rather than a column; these indexes are what keep that lookup
-- from scanning both tables. The expression here, in the query and in
-- `phoneLoginKey` must stay the same.
CREATE INDEX "users_phone_login_key_idx"
  ON "users" (right(regexp_replace("phone", '\D', '', 'g'), 9))
  WHERE "phone" IS NOT NULL;

CREATE INDEX "gym_credentials_phone_login_key_idx"
  ON "gym_credentials" (right(regexp_replace("phone", '\D', '', 'g'), 9))
  WHERE "phone" IS NOT NULL;
