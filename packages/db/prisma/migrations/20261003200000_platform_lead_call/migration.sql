-- The marketing site's two calls to action are now "Book a demo" and "Request a
-- call"; the call request captures a lead of its own, so `PlatformLeadType` gains
-- a fourth member.
--
-- Additive only: `ALTER TYPE … ADD VALUE` appends a label without rewriting any
-- row, and the new value is not referenced in this migration (PostgreSQL forbids
-- using a freshly added enum label in the transaction that adds it).
ALTER TYPE "PlatformLeadType" ADD VALUE IF NOT EXISTS 'CALL';
