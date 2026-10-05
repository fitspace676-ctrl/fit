-- The mobile app's own accent colour (#rrggbb). Null follows the member
-- portal's colour, then the brand's (see resolveMobileAppPrimaryColor).
ALTER TABLE "gyms" ADD COLUMN "mobileAppPrimaryColor" TEXT;
