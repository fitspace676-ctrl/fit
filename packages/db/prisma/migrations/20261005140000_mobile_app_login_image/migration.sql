-- The mobile app's own sign-in photograph. Null falls back to the member
-- portal's sign-in photograph (settings.memberPortal.loginImageUrl).
ALTER TABLE "gyms" ADD COLUMN "mobileAppLoginImageUrl" TEXT;
